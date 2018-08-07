package org.akkajs

import akka.actor._
import com.typesafe.config.Config
import org.scalajs.dom.document.{getElementById => getElem}

import scalatags.JsDom._
import scalatags.JsDom.all._

object UI {

  def start(config: Config) = {
    implicit  val system = ActorSystem("streams", config)
    system.actorOf(Props(UI()), "page")
  }

  case class UI()(implicit system: ActorSystem) extends DomActor {
    override val domElement = Some(getElem("root"))

    def template() = div(cls := "pure-g")(
      div(cls := "pure-u-1-3")(
        div(cls := "pure-form")(
          button(
            cls := "pure-button pure-button-primary",
            onclick := {
              () => {
                Streams.complexFlow(false)
          }})("Run")
        )
      )
    )
  }

}
