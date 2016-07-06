package eu.unicredit

import akka.actor._

import org.scalajs.dom.document.{getElementById => getElem}

import scalatags.JsDom._
import scalatags.JsDom.all._

import org.scalajs.dom.raw._

object ChatUI {

  implicit lazy val system = ActorSystem("chat", AkkaConfig.config)

  def start =
    system.actorOf(Props(ChatUI()), "page")

  case class ChatUI() extends DomActor {
    override val domElement = Some(getElem("root"))

    val urlBox = input("placeholder".attr := "enter url here").render

    def template() = div(cls := "pure-g")(
      div(cls := "pure-u-1-3")(
        h2("Add chat server:"),
        div(cls := "pure-form")(
          urlBox,
          button(
            cls := "pure-button pure-button-primary",
            onclick := {
              () => context.actorOf(Props(ChatBox(urlBox.value)))
          })("Connect")
        )
      )
    )
  }

  case class ChatBox(wsUrl: String) extends DomActorWithParams[List[String]] {

    case class NewMsg(txt: String)

    val ws = new WebSocket(s"ws://$wsUrl")
    ws.onmessage = { (event: MessageEvent) => self ! NewMsg(event.data.toString)}

    val initValue = List()

    val msgBox = input("placeholder".attr := "enter message").render

    def template(txt: List[String]) = div(cls := "pure-u-1-3")(
      h3(s"Server: $wsUrl"),
      msgBox,
      button(
        cls := "pure-button pure-button-primary",
        onclick := {() => ws.send(msgBox.value)})("Send"),
      ul(cls := "pure-menu-list")(
        for (t <- txt) yield li(cls := "pure-menu-item")(t)
      ),
      hr(),
      button(
        cls := "pure-button pure-button-primary",
        onclick := {() => self ! PoisonPill})("Close")
    )

    override def operative = withText(initValue)

    def withText(last: List[String]): Receive = domManagement orElse {
      case NewMsg(txt) =>
        val newTxt = (last :+ txt).takeRight(5)
        self ! UpdateValue(newTxt)
        context.become(withText(newTxt))
    }
  }

}
