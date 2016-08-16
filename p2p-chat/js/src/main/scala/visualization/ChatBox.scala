package eu.unicredit

import akka.actor._

import scalatags.JsDom._
import scalatags.JsDom.all._

import scala.scalajs.js

object ChatBoxMsgs {

  case object GetSelfId
  case class SelfId(id: String)

  case class GetId(name: String)
  case class Id(name: String, id: String)

  case class NewMsg(from: String, txt: String)
}

case class ChatBox(tm: ActorRef) extends DomActorWithParams[List[String]] {

  val initValue = List()

  val toBox = input("placeholder".attr := "target").render
  val msgBox = input("placeholder".attr := "enter message").render

  case class MsgToSend(targetName: String, msg: String)

  def template(txt: List[String]) = div(cls := "pure-form")(
    div(cls := "pure-u-3-3")(
    h3(s"Chat: "),
    toBox,
    msgBox,
    button(
      cls := "pure-button pure-button-primary",
      onclick := {() => self ! MsgToSend(toBox.value, msgBox.value)})("Send"),
    ul(cls := "pure-menu-list")(
      for (t <- txt) yield li(cls := "pure-menu-item")(t)
    ),
    hr()
  ))

  override def operative = {
    tm ! ChatBoxMsgs.GetSelfId
    withText("", List(), None)
  }

  def withText(id: String, last: List[String], toSend: Option[MsgToSend]): Receive = domManagement orElse {
    case ChatBoxMsgs.SelfId(myid) =>
      context.become(withText(myid, last, toSend))
    case toSend: MsgToSend =>
      tm ! ChatBoxMsgs.GetId(toSend.targetName)
      context.become(withText(id, last, Some(toSend)))
    case ChatBoxMsgs.Id(name, targetId) =>
      if (toSend.isDefined && toSend.get.targetName == name) {
        println("id found "+targetId.toString)
        tm ! TreeMsgs.Chat(targetId.toString, id, toSend.get.msg)
        context.become(withText(id, last, None))
      }
    case ChatBoxMsgs.NewMsg(from, txt) =>
      val msg = s"$from -> $txt"
      val newTxt = (last :+ msg).takeRight(5)
      self ! UpdateValue(newTxt)
      context.become(withText(id, newTxt, toSend))
  }

}
