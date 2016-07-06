package eu.unicredit

import akka.actor._

import org.scalajs.dom.document.{getElementById => getElem}

import scalatags.JsDom._
import scalatags.JsDom.all._

object ToDo {

  implicit lazy val system = ActorSystem("todo", AkkaConfig.config)

  def start =
    system.actorOf(Props(ToDoList()), "page")

  case class ToDoList() extends DomActor {
    override val domElement = Some(getElem("root"))

    val inputBox =
      input("placeholder".attr := "what to do?").render

    def template() = ul(cls := "pure-menu-list")(
        h1("ToDo:"),
        div(cls := "pure-form")(
          inputBox,
          button(
            cls := "pure-button pure-button-primary",
            onclick := {
              () => context.actorOf(Props(ToDoElem(inputBox.value)))
            }
          )("Add")
        )
      )
  }

  case class ToDoElem(value: String) extends DomActor {
    def template() = div(
      li(cls := "pure-menu-item")(
        div(
          h3(value),
          button(
            cls := "pure-button pure-button-primary",
            onclick := {
              () => self ! PoisonPill
            }
          )("Remove")
        )
      )
    )
  }

}
