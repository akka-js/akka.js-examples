package raft

import scala.language.postfixOps
import akka.actor.{ Actor, ActorRef }
import scala.concurrent.duration._
import scala.concurrent.Promise
import math.random
import akka.actor._

/* messages */
sealed trait Message
case object Timeout extends Message
case object Heartbeat extends Message
case class Init(nodes: List[NodeId]) extends Message

case class RequestVote(
  term: Term,
  candidateId: NodeId,
  lastLogIndex: Int,
  lastLogTerm: Term) extends Message

case class AppendEntries(
  term: Term,
  leaderId: NodeId,
  prevLogIndex: Int,
  prevLogTerm: Term,
  entries: Vector[Entry],
  leaderCommit: Int) extends Message

sealed trait Vote extends Message
case class DenyVote(term: Term) extends Vote
case class GrantVote(term: Term) extends Vote

sealed trait AppendReply extends Message
case class AppendFailure(term: Term) extends AppendReply
case class AppendSuccess(term: Term, index: Int) extends AppendReply

case class ClientRequest(cid: Int, command: String) extends Message

class Raft(val i: Int, val ui: ActorRef) extends Actor {
  import scala.collection.mutable.HashMap
  
  var data: Meta = Meta(List())
  var state: Role = Initialise
  val timers = HashMap[String, Cancellable]()
  
  def cancelTimer(name: String) = {
    try {
      timers(name).cancel 
    } catch { case _ : Throwable => }
  }
  
  def setTimer(name: String, kind: Message, timeout: FiniteDuration, bool: Boolean) = {
    import context.dispatcher
    timers += name -> context.system.scheduler.scheduleOnce(timeout) { self ! kind }
  }
  
  def switchState(to: Role): Unit = {
    (state, to) match {
      case (Leader, Follower) =>
        cancelTimer("heartbeat")
        resetTimer
      case (Candidate, Follower) => resetTimer
      case (Initialise, Follower) => resetTimer
      case _ => 
    }
    state = to
    ui ! UIState(i, state)
    context.become(to match {
      case Follower => follower
      case Candidate => candidate
      case Leader => leader
      case Initialise => receive
    })
  }
  
  def receive = {
    case cluster: Init =>
      data = initialised(cluster)
      switchState(Follower)
  }
  
  def follower: Receive = {
    case rpc: RequestVote =>
      vote(rpc, data) match {
        case (msg: GrantVote, updData) =>
          resetTimer
          data = updData
          sender ! msg
        case (msg: DenyVote, updData) =>
          data = updData 
          sender ! msg
      }
    case rpc: AppendEntries =>
      data.setLeader(rpc.leaderId)
      resetTimer
      val msg = append(rpc, data)
      sender ! msg
    case rpc: ClientRequest =>
      forwardRequest(rpc, data)
    case Timeout =>
      data = preparedForCandidate(data)
      switchState(Candidate)
  }
  
  def candidate: Receive = {
    // voting events   
    case GrantVote(term) =>
      data.votes = data.votes.gotVoteFrom(sender)
      if (data.votes.majority(data.nodes.length))
        data = preparedForLeader(data)
        switchState(Leader)
    case DenyVote(term) =>
      if (term > data.term) {
        data.selectTerm(term)
        data = preparedForFollower(data)
        switchState(Follower)
      } 

    // other   
    case rpc: AppendEntries =>
      data.setLeader(rpc.leaderId)
      val msg = append(rpc, data)
      data = preparedForFollower(data)
      sender ! msg
      switchState(Follower)
    case rpc: ClientRequest =>
      forwardRequest(rpc, data)
    case Timeout =>
      data = preparedForCandidate(data)
      switchState(Candidate)
  }    
  
  def leader: Receive = {
    case clientRpc: ClientRequest =>
      writeToLog(sender, clientRpc, data)
      sendEntries(data)
    case rpc: AppendSuccess =>
      data.log = data.log.resetNextFor(sender)
      data.log = data.log.matchFor(sender, Some(rpc.index))
      leaderCommitEntries(rpc, data)
      applyEntries(data)
    case rpc: AppendFailure =>
      if (rpc.term <= data.term) {
        data.log = data.log.decrementNextFor(sender)
        resendTo(sender, data) // let heartbeats do the catch up work
      } else {
        data.term = rpc.term
        data = preparedForFollower(data)
        switchState(Follower)
      }
    case Heartbeat =>
      ui ! UIHeartbeat(i)
      sendEntries(data)
  }
 
  private def preparedForFollower(state: Meta): Meta = {
    state.votes = Votes()
    state
  }

  private def preparedForCandidate(data: Meta): Meta = {
    data.nextTerm
    data.votes = Votes(votedFor = Some(self), received = List(self))
    data.nodes.filter(_ != self).map { t =>
      t ! RequestVote(
        term = data.term,
        candidateId = self,
        lastLogIndex = data.log.entries.lastIndex,
        lastLogTerm = data.log.entries.lastTerm)
    }
    resetTimer
    data
  }

  private def preparedForLeader(state: Meta) = {
    //log.info(s"Elected to leader for term: ${state.term}")
    val nexts = state.log.nextIndex.map(x => (x._1, state.log.entries.lastIndex + 1))
    val matches = state.log.matchIndex.map(x => (x._1, 0))
    state.log = state.log.copy(nextIndex = nexts, matchIndex = matches)
    sendEntries(state)
    state
  }

  private def initialised(cluster: Init): Meta = Meta(cluster.nodes)

  private def resetHeartbeatTimer = {
    cancelTimer("heartbeat")
    val nextTimeout = (random * 100).toInt + 200
    setTimer("heartbeat", Heartbeat, nextTimeout millis, false)
  }

  private def resetTimer = {
    cancelTimer("timeout")
    val nextTimeout = (random * 100).toInt + 280
    setTimer("timeout", Timeout, nextTimeout millis, false)
  }

  /*
   *  --- Internals ---
   */

  private def forwardRequest(rpc: ClientRequest, data: Meta) = {
    data.leader match {
      case Some(target) => target forward rpc
      case None => // drops message, relies on client to retry
    }
  }

  private def applyEntries(data: Meta) =
    for (i <- data.log.lastApplied until data.log.commitIndex) {
      val entry = data.log.entries(i)
      val result = data.rsm.execute(Get) // TODO: make generic
      data.log = data.log.applied

      entry.client match {
        case Some(ref) => ref.sender ! (ref.cid, result)
        case None => // ignore
      }
    }

  private def leaderCommitEntries(rpc: AppendSuccess, data: Meta) = {
    if (rpc.index >= data.log.commitIndex &&
      data.log.entries.termOf(rpc.index) == data.term) {
      val matches = data.log.matchIndex.count(_._2 == rpc.index)
      if (matches >= Math.ceil(data.nodes.length / 2.0))
        data.log = data.log.commit(rpc.index)
    }
  }

  private def sendEntries(data: Meta) = {
    resetHeartbeatTimer
    data.nodes.filterNot(_ == self).map { node =>
      val message = compileMessage(node, data)
      node ! message
    }
  }

  private def resendTo(node: NodeId, data: Meta) = {
    val message = compileMessage(node, data)
    node ! message
  }

  private def compileMessage(node: ActorRef, data: Meta): AppendEntries = {
    val prevIndex = data.log.nextIndex(node) - 1
    val prevTerm = data.log.entries.termOf(prevIndex)
    val fromMissing = missingRange(data.log.entries.lastIndex, prevIndex)
    AppendEntries(
      term = data.term,
      leaderId = self,
      prevLogIndex = prevIndex,
      prevLogTerm = prevTerm,
      entries = data.log.entries.takeRight(fromMissing),
      leaderCommit = data.log.commitIndex
    )
  }

  private def missingRange(lastIndex: Int, prevIndex: Int) =
    if (prevIndex == 0) 1
    else lastIndex - prevIndex

  private def writeToLog(sender: NodeId, rpc: ClientRequest, data: Meta) = {
    val ref = InternalClientRef(sender, rpc.cid)
    val entry = Entry(rpc.command, data.term, Some(ref))
    data.leaderAppend(self, Vector(entry))
  }

  /*
   * AppendEntries handling 
   */
  private def append(rpc: AppendEntries, data: Meta): AppendReply = {
    if (leaderIsBehind(rpc, data)) appendFail(rpc, data)
    else if (!hasMatchingLogEntryAtPrevPosition(rpc, data)) appendFail(rpc, data)
    else appendSuccess(rpc, data)
  }

  private def leaderIsBehind(rpc: AppendEntries, data: Meta): Boolean =
    rpc.term < data.term

  private def hasMatchingLogEntryAtPrevPosition(
    rpc: AppendEntries, data: Meta): Boolean =
    (rpc.prevLogIndex == 0 || // guards for bootstrap case
      (data.log.entries.hasEntryAt(rpc.prevLogIndex) &&
        (data.log.entries.termOf(rpc.prevLogIndex) == rpc.prevLogTerm)))

  private def appendFail(rpc: AppendEntries, data: Meta) = {
    data.selectTerm(rpc.term)
    AppendFailure(data.term)
  }

  private def appendSuccess(rpc: AppendEntries, data: Meta) = {
    data.append(rpc.entries, rpc.prevLogIndex)
    data.log = data.log.commit(rpc.leaderCommit)
    followerApplyEntries(data)
    data.selectTerm(rpc.term)
    AppendSuccess(data.term, data.log.entries.lastIndex)
  }

  private def followerApplyEntries(data: Meta) =
    for (i <- data.log.lastApplied until data.log.commitIndex) {
      val entry = data.log.entries(i)
      data.rsm.execute(Get) // TODO: make generic
      data.log = data.log.applied
    }

  /*
   * Determine whether to grant or deny vote
   */
  private def vote(rpc: RequestVote, data: Meta): (Vote, Meta) =
    if (alreadyVoted(rpc, data)) deny(rpc, data)
    else if (rpc.term < data.term) deny(rpc, data)
    else if (rpc.term == data.term)
      if (candidateLogTermIsBehind(rpc, data)) deny(rpc, data)
      else if (candidateLogTermIsEqualButHasShorterLog(rpc, data)) deny(rpc, data)
      else grant(rpc, data) // follower and candidate are equal, grant
    else grant(rpc, data) // candidate is ahead, grant

  private def deny(rpc: RequestVote, data: Meta) = {
    data.term = Term.max(data.term, rpc.term)
    (DenyVote(data.term), data)
  }

  private def grant(rpc: RequestVote, data: Meta): (Vote, Meta) = {
    data.votes = data.votes.vote(rpc.candidateId)
    data.term = Term.max(data.term, rpc.term)
    (GrantVote(data.term), data)
  }

  private def candidateLogTermIsBehind(rpc: RequestVote, data: Meta) =
    data.log.entries.last.term > rpc.lastLogTerm

  private def candidateLogTermIsEqualButHasShorterLog(rpc: RequestVote, data: Meta) =
    (data.log.entries.last.term == rpc.lastLogTerm) &&
      (data.log.entries.length - 1 > rpc.lastLogIndex)

  private def alreadyVoted(rpc: RequestVote, data: Meta): Boolean =
    data.votes.votedFor match {
      case Some(_) if rpc.term == data.term => true
      case Some(_) if rpc.term > data.term => false
      case None => false
    }
}

object Raft {
  self =>

  var members: List[ActorRef] = List()

  def apply(size: Int, ui: ActorRef)(implicit system: ActorSystem): List[NodeId] = {
    
    val _members =
      for (i <- 0 until size) yield
      system.actorOf(Props(new Raft(i, ui)), "member" + i)


    import system._
    system.scheduler.scheduleOnce(0 millis)({
      _members.foreach(m => m ! Init(_members.toList))
      self.members = _members.toList
    })

    _members.toList
  }
}
