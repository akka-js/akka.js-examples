package eu.unicredit

import akka.actor._

import upickle._
import upickle.default._

import scala.scalajs.js

import java.util.UUID.randomUUID

object TreeMsgs {

  case class SetName(name: String)

  case class Node(id: String, channel: ActorRef) {
    override def equals(x: Any) = {
      x match {
        case Node(xid, _) => xid == id
        case _ => false
      }
    }
  }

  class TreeMsg
  case class AddChannel(conn: ActorRef, fn: String => TreeMsg) extends TreeMsg
  case class RemoveChannel(conn: ActorRef) extends TreeMsg
  case class AddParent(node: Node) extends TreeMsg
  case class AddChild(node: Node) extends TreeMsg
  case class Remove(node: Node) extends TreeMsg

  case class AskId() extends WebRTCMsgs.MessageToBus("askid")
  case class IdAnswer(id: String) extends WebRTCMsgs.MessageToBus("idanswer")

  case class UpdateRootAdd(id: String, json: String) extends WebRTCMsgs.MessageToBus("updaterootadd")
  case class UpdateRootRemove(id: String) extends WebRTCMsgs.MessageToBus("updaterootremove")
  case class UpdateStatus(json: String) extends WebRTCMsgs.MessageToBus("updatestatus")
  case class Chat(target: String, sender: String, content: String) extends WebRTCMsgs.MessageToBus("chat")
}

case class TreeManager(tv: ActorRef) extends Actor with JsonTreeHelpers {
  import TreeMsgs._

  val id = randomUUID.toString
  val myNode = Node(id, self)

  tv ! TreeViewMsgs.SetId(id)

  def receive = {
    case SetName(name) =>
      val status = emptyRoot(id)
      val me = status.selectDynamic(id)
      me.updateDynamic("name")(name)
      status.updateDynamic(id)(me)
      tv ! TreeViewMsgs.SetId(name)
      context.become(operative(name, status = status))
  }

  def operative(
      name: String,
      parent: Option[Node] = None,
      children: List[Node] = List(),
      status: js.Dynamic): Receive = {
    case AddChannel(conn, fn) =>
      conn ! WebRTCMsgs.Assign(self, (ar: ActorRef) => self ! RemoveChannel(ar))
      println("add channel")
      context.actorOf(Props(IdResolver(conn, fn)))
    case RemoveChannel(conn) =>
      children.find(_.channel.path == conn.path).map(node => self ! Remove(node))
      parent.find(_.channel.path == conn.path).map(node => self ! Remove(node))
    case ask: AskId =>
      println("received askid")
      sender ! IdAnswer(id)
    case idans: IdAnswer =>
      println("received idanswer")
      val orSender = sender.path.toString
      context.children.foreach(_ ! (idans, orSender))
    case AddParent(node) =>
      println("add parent")
      import context.dispatcher
      import scala.concurrent.duration._
      //to be sure tree exists before updating descendants
      context.system.scheduler.scheduleOnce(500 millis)(
        node.channel ! UpdateRootAdd(node.id, js.JSON.stringify(status))
      )
      context.become(operative(name, Some(node), children, status))
    case AddChild(node) =>
      println("add child")
      context.become(operative(name, parent, children :+ node, status))
    case Remove(node) =>
      self ! UpdateRootRemove(node.id)
      context.become(operative(name, parent, children.filterNot(_ == node), status))

    case UpdateStatus(newStatus) =>
      println("NEW STATUS!\n"+newStatus)
      val ns = js.JSON.parse(newStatus)

      tv ! TreeViewMsgs.NewStatus(ns)
      children.foreach(_.channel ! UpdateStatus(js.JSON.stringify(ns)))

      context.become(operative(name, parent, children, ns))
    case ura @ UpdateRootAdd(nid, ntree) =>
      println("received update root add")
      if (parent.isEmpty) {
        merge(nid)(status, js.JSON.parse(ntree))

        self ! UpdateStatus(js.JSON.stringify(status))
      } else parent.get.channel ! ura
    case urr @ UpdateRootRemove(oid) =>
      if (parent.isEmpty) {
        remove(oid)(status)

        tv ! TreeViewMsgs.NewStatus(status)
        children.foreach(_.channel ! UpdateStatus(js.JSON.stringify(status)))
      } else {
        if (parent.get.id == oid) {
          keep(id)(status)
          children.foreach(_.channel ! UpdateStatus(js.JSON.stringify(status)))
          tv ! TreeViewMsgs.NewStatus(status)
        } else
          parent.get.channel ! urr
      }
    //Chat management
    case ChatBoxMsgs.GetSelfId => sender ! ChatBoxMsgs.SelfId(id)
    case ChatBoxMsgs.GetId(name) =>
      js.Object.keys(status.asInstanceOf[js.Object]).foreach(k => {
        if (k.toString != "root" && status.selectDynamic(k).name.toString == name) {
          sender ! ChatBoxMsgs.Id(name, k.toString)
        }
      })

    case _chat @ Chat(target, sender, content) =>
      val chatBox = context.system.actorSelection("akka://p2pchat/user/page/chatbox")
      val chat =
        if (sender != "") _chat else {
          chatBox ! ChatBoxMsgs.NewMsg(name, content)
          Chat(target, name, content)
        }

      println("ok chat msg! "+target+" my id "+id+" sender "+sender)
      if (target == id) chatBox ! ChatBoxMsgs.NewMsg(sender, content)
      else {
        val down =
          children.find(c =>
            c.id == target ||
            isSonOf(target, c.id)(status)
          )

        if (down.isDefined) down.map(_.channel ! chat)
        else parent.map(_.channel ! chat)
      }

    case any => println("UNMANAGED "+any)
  }

  case class IdResolver(conn: ActorRef, fn: String => TreeMsg) extends Actor {

    import context.dispatcher

    conn ! AskId()

    def receive = {
      case (IdAnswer(id), connSender) =>
        if (connSender == conn.path.toString) {
          println("Id received for me! "+id)
          context.parent ! fn(id)
        }
      case _ =>
    }
  }
}
