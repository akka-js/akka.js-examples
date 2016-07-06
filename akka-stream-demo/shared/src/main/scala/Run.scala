package eu.unicredit

import akka.actor.ActorSystem
import com.typesafe.config.Config

object Run {

  def run(akkaConfig: Config) = {
    implicit val system = ActorSystem("streams", akkaConfig)
    PingPong.start
    /*
    import system.dispatcher
    import scala.concurrent.duration._
    system.scheduler.scheduleOnce(0 millis){
      Streams.complexFlow(true)
      //Streams.simpleFlow
      //Streams.complexFlow(true)
    }
    */
    Streams.simpleFlow
    Streams.complexFlow(true)
  }
}
