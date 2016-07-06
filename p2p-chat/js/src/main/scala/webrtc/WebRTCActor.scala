package eu.unicredit

import akka.actor._

import scala.util.{Success, Failure}

import scala.scalajs.js

import org.scalajs.dom.raw._
import org.scalajs.dom.experimental.webrtc._

import upickle._
import upickle.default._

import java.util.UUID.randomUUID

import scala.concurrent.duration._

object WebRTCMsgs {

  sealed trait Command
  case object Create extends Command
  case class Join(token: String) extends Command

  case class OfferToken(token: String) extends Command
  case class JoinToken(token: String) extends Command

  case object Connected extends Command
  case object Disconnected extends Command

  case class Assign(manager: ActorRef, onDisconnect: ActorRef => Unit) extends Command

  class MessageFromBus(val text: String)
  class MessageToBus(val typ: String)
}

case class WebRTCConnection(ui: ActorRef) extends Actor {
  import WebRTCMsgs._
  import Serializations._
  import context.dispatcher

  val stuns: js.Array[String] =
    //StunServers.servers
    //debug mode
    //let always fallback until specification is clear
    js.Array("localhost", "localhost:3478", "127.0.0.1", "127.0.0.1:3478", "0.0.0.0", "0.0.0.0:3478")

  val servers =
    stuns.map(url => RTCIceServer(urls = s"stun:$url"))

  val offerOptions =
    RTCOfferOptions(
      iceRestart = true,
      offerToReceiveAudio = 0,
      offerToReceiveVideo = 0,
      voiceActivityDetection = false)

  val channelOptions =
    RTCDataChannelInit(
      ordered = true
    )

  val connection =
    new RTCPeerConnection(
      RTCConfiguration(
      iceServers = servers/*,
      iceTransportPolicy = RTCIceTransportPolicy.all,
      bundlePolicy = RTCBundlePolicy.balanced*/)
    )

  connection.onicecandidate =
    (e: RTCPeerConnectionIceEvent) => {
      if (e.candidate == null)
        self ! connection.localDescription
    }

  def receive = {
    case Create =>
      println("have to create a new connection")
      context.become(connect)
    case Join(token) =>
      println("have to join connection")
      context.become(join(read[RTCSessionDescription](token)))
  }

  def bindChannel(channel: RTCDataChannel) = {

    channel.onclose = (e: Event) => {
      println("CLOSE on BUS!!!!")
      context.parent ! Disconnected
      self ! PoisonPill
    }

    channel.onerror = (e: Event) => {
      println("ERROR on BUS!!!!")
      context.parent ! Disconnected
      self ! PoisonPill
    }

    channel.onmessage = (e: MessageEvent) => {
      self ! new MessageFromBus(e.data.toString)
    }
  }

  def connect: Receive = {

    val channel =
      connection.createDataChannel(randomUUID().toString, channelOptions)

    bindChannel(channel)

    connection.createOffer(offerOptions).toFuture.onComplete{
      case Success(desc: RTCSessionDescription) =>
        connection.setLocalDescription(desc)
      case Failure(err) =>
        println(s"Couldn't create offer $err")
    }

    ;{
      case desc: RTCSessionDescription =>
        ui ! OfferToken(write[RTCSessionDescription](desc))
        context.become(waitingForClient(channel))
    }
  }

  def waitingForClient(channel: RTCDataChannel): Receive = {
    case JoinToken(token) =>
      read[RTCSessionDescription](token)
      connection.setRemoteDescription(read[RTCSessionDescription](token)).toFuture.onComplete{
        case Success(_) =>
           context.become(connected(channel))
        case Failure(err) =>
          println(s"couldn't bind remote description! $err")
      }
  }

  def join(offerDesc: RTCSessionDescription): Receive = {

    connection.ondatachannel = (e: RTCDataChannelEvent) => {
      e.channel.onopen = (_: Event) => (
        context.become(connected(e.channel))
      )

      bindChannel(e.channel)
    }

    connection.setRemoteDescription(offerDesc)

    connection.createAnswer.toFuture.onComplete{
      case Success(desc: RTCSessionDescription) =>
        connection.setLocalDescription(desc)
      case Failure(err) =>
        println(s"Couldn't create answer $err")
    }

    ;{
      case desc: RTCSessionDescription =>
        ui ! JoinToken(write(desc))
    }
  }

  var quitFun: Option[ActorRef => Unit] = None

  def connected(channel: RTCDataChannel): Receive = {
    ui ! Connected

    ;{
      case Assign(manager, qf) =>
        println("becoming operative!")
        val channelRef = self
        context.actorOf(Props(new Actor {
          def receive = {case _ =>}
          override def postStop() =
            manager ! TreeMsgs.RemoveChannel(channelRef)
        }))
        quitFun = Some(qf)

        startHeartbeats
        context.become(operative(channel, manager, first = true))
      case any =>
        context.system.scheduler.scheduleOnce(50 millis)(self ! any)
    }
  }

  case object Timeout
  case object Heartbeat extends MessageToBus("heartbeat") { val text = "heartbeat" }
  val timeoutMaxRetry = 3

  def startHeartbeats = {
    import context.dispatcher
    context.system.scheduler.schedule(2 seconds, 2 seconds)(
        self ! Heartbeat
      )
  }

  def operative(channel: RTCDataChannel, manager: ActorRef, maxRetry: Int = timeoutMaxRetry, first: Boolean = false): Receive = {
    import context.dispatcher
    val timeout = context.system.scheduler.scheduleOnce({
      if (first) 15 seconds
      else 5 seconds
      })(
        self ! Timeout
      )
    ;{
    case Timeout =>
      if (maxRetry > 0) {
        println("TIMEOUT! retry "+maxRetry)
        context.become(operative(channel, manager, maxRetry - 1))
      } else {
        println("end of retry. SUICIDE!")
        self ! PoisonPill
      }
    case msg: MessageFromBus =>
      if (msg.text.toString == Heartbeat.text) {
        timeout.cancel
        context.become(operative(channel, manager))
      } else {
        val obj = js.JSON.parse(msg.text).asInstanceOf[js.Dynamic]
        val parsedMsg =
          obj.`type`.toString match {
            case "askid" => TreeMsgs.AskId()
            case "idanswer" => TreeMsgs.IdAnswer(obj.id.toString)
            case "updaterootadd" => TreeMsgs.UpdateRootAdd(obj.id.toString, obj.tree.toString)
            case "updaterootremove" => TreeMsgs.UpdateRootRemove(obj.id.toString)
            case "updatestatus" => TreeMsgs.UpdateStatus(obj.tree.toString)
            case "chat" => TreeMsgs.Chat(obj.target.toString, obj.sender.toString, obj.content.toString)
            case _ => "no deserializer"
          }
        manager ! parsedMsg
      }
    case msg: MessageToBus =>
      if (channel.readyState != RTCDataChannelState.open) {
        context.system.scheduler.scheduleOnce(50 millis)(self ! msg)
      } else {
        val text =
          msg match {
            case Heartbeat => Heartbeat.text
            case _ : TreeMsgs.AskId => write(Map("type" -> msg.typ))
            case TreeMsgs.IdAnswer(id) => write(Map("type" -> msg.typ, "id" -> id))
            case TreeMsgs.UpdateRootAdd(id, json) => write(Map("type" -> msg.typ, "id" -> id, "tree" -> json))
            case TreeMsgs.UpdateRootRemove(id) => write(Map("type" -> msg.typ, "id" -> id))
            case TreeMsgs.UpdateStatus(json) => write(Map("type" -> msg.typ, "tree" -> json))
            case TreeMsgs.Chat(target, sender, content) => write(Map("type" -> msg.typ, "target" -> target, "sender" -> sender, "content" -> content))
            case _ => "no serializer"
          }

        channel.send(text)
      }
    }
  }

  override def postStop() = {
    println("post stop "+self.path.toString)
    quitFun.map(_(self))
  }

}

object StunServers {

  def servers =
  //real world
  js.Array(
    "stun.l.google.com:19302",
    "stun1.l.google.com:19302",
    "stun2.l.google.com:19302",
    "stun3.l.google.com:19302",
    "stun4.l.google.com:19302",
    "stun01.sipphone.com",
    "stun.ekiga.net",
    "stun.fwdnet.netv",
    "stun.ideasip.com",
    "stun.iptel.org",
    "stun.rixtelecom.se",
    "stun.schlund.de",
    "stunserver.org",
    "stun.softjoys.com",
    "stun.voiparound.com",
    "stun.voipbuster.com",
    "stun.voipstunt.com",
    "stun.voxgratia.org",
    "stun.xten.com"
    )
}
