package eu.unicredit

import akka.actor.ActorSystem
import com.typesafe.config.Config

object Run {

  def run() = {
    implicit val system = ActorSystem("streams")

    Streams.simpleFlow
    //Streams.complexFlow(false)
    Streams.complexFlow(true)
  }
}
