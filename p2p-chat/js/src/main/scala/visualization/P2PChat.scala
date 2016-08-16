package eu.unicredit

import akka.actor._

import org.scalajs.dom.{window, document}
import org.scalajs.dom.document.{getElementById => getElem}

import scalatags.JsDom._
import scalatags.JsDom.all._

object P2PChat {

  implicit lazy val system = ActorSystem("p2pchat")

  def run =
    system.actorOf(Props(Page()), "page")

  case class Page() extends DomActor {
    override val domElement = Some(getElem("root"))

    def template = div(/*cls := "pure-g"*/)()

    override def operative = {
      val tv = context.actorOf(Props(TreeView()), "treeview")

      val treeManager = system.actorOf(Props(TreeManager(tv)))

      context.actorOf(Props(SetName(treeManager)), "setname")
      context.actorOf(Props(AddConnection(treeManager)), "addconnection")
      context.actorOf(Props(ChatBox(treeManager)), "chatbox")

      domManagement
    }
  }

  case class SetName(tm: ActorRef) extends DomActorWithParams[String] {

    val initValue = ""

    val nameBox =
      input("placeholder".attr := "write here your name").render

    def template(name: String) =
      if (name == "")
        div(cls := "pure-u-3-3")(
          div(cls := "pure-form")(
            nameBox,
            button(
              cls := "pure-button pure-button-primary",
              onclick := {
                () => {
                  tm ! TreeMsgs.SetName(nameBox.value)
                  self ! UpdateValue(nameBox.value)
                  }})(
              "Set"
            )
          )
        )
      else
        div(cls := "pure-u-3-3")(
          h4(s"$name")
        )
  }

  case class AddConnection(tm: ActorRef) extends DomActor {
    def template() = div(cls := "pure-u-3-3")(
        div(cls := "pure-form")(
          button(
            cls := "pure-button pure-button-primary",
            onclick := {
              () => context.actorOf(Props(ConnectionBox(ConnStatus.BuildOffer, tm)))})(
            " Add child"
          ),
          button(
            cls := "pure-button pure-button-primary",
            onclick := {
              () => context.actorOf(Props(ConnectionBox(ConnStatus.BuildAnswer, tm)))})(
            " Answer parent"
          )
        )
      )
  }

  object ConnStatus {
    trait Status

    case object Choose extends Status
    case object BuildOffer extends Status
    case class Offer(token: String) extends Status
    case object BuildAnswer extends Status
    case class Answer(token: String) extends Status
    case class WaitingAnswer(token: String) extends Status
    case class WaitingConnection(token: String) extends Status
    case object Connected extends Status
  }

  case class ConnectionBox(_initValue: ConnStatus.Status, tm: ActorRef) extends DomActorWithParams[ConnStatus.Status] {
    import ConnStatus._

    val initValue = _initValue//Choose

    val conn = context.system.actorOf(Props(WebRTCConnection(self)))

    def template(s: Status) =
    div(
      h3(s"Channel: "),
      s match {
        case Choose =>
          div(
            button(
              cls := "pure-button pure-button-primary",
              onclick := {
                () => self ! UpdateValue(BuildOffer)})(
              "Offer connection"
            ),
            button(
              cls := "pure-button pure-button-primary",
              onclick := {
                () => self ! UpdateValue(BuildAnswer)})(
              "Answer connection"
            )
          )
        case BuildOffer =>
          conn ! WebRTCMsgs.Create

          div(h3("Waiting offer"))
        case Offer(token) =>
          val answerBox =
            input("placeholder".attr := "paste here answer").render

            div(
              input(value := token/*, "disabled".attr := "true"*/),
              answerBox,
              button(
                cls := "pure-button pure-button-primary",
                onclick := {
                  () => self ! UpdateValue(WaitingConnection(answerBox.value))})(
                "Connect!"
              )
          )
        case BuildAnswer =>
          val offerBox =
            input("placeholder".attr := "paste here offer").render

            div(
              offerBox,
              button(
                cls := "pure-button pure-button-primary",
                onclick := {
                  () => self ! UpdateValue(WaitingAnswer(offerBox.value))})(
                "Connect!"
              )
          )
        case Answer(token) =>
          div(
            input(value := token/*, "disabled".attr := "true"*/),
            h3("Waiting finalization")
          )
        case WaitingAnswer(token) =>
          conn ! WebRTCMsgs.Join(token)

          div(h3("Waiting answer"))
        case WaitingConnection(token) =>
          conn ! WebRTCMsgs.JoinToken(token)

          div(h3("Waiting connection"))
        case Connected =>
          initValue match {
            case BuildOffer =>
              tm ! TreeMsgs.AddChannel(conn, {id: String => TreeMsgs.AddChild(TreeMsgs.Node(id, conn))})
            case BuildAnswer =>
              tm ! TreeMsgs.AddChannel(conn, {id: String => TreeMsgs.AddParent(TreeMsgs.Node(id, conn))})
          }
          div(h3("Connected"),
              button(
                cls := "pure-button pure-button-primary",
                onclick := {() => self ! PoisonPill})("Close")
          )
      },
      hr()
    )

    override def operative = domManagement orElse {
      case WebRTCMsgs.OfferToken(token) =>
        self ! UpdateValue(Offer(token))
      case WebRTCMsgs.JoinToken(token) =>
        self ! UpdateValue(Answer(token))
      case WebRTCMsgs.Connected =>
        self ! UpdateValue(Connected)
      case WebRTCMsgs.Disconnected =>
        self ! PoisonPill
    }
  }

}
