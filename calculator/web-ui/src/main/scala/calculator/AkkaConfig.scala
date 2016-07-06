package calculator

import com.typesafe.config.{Config, ConfigFactory}

object AkkaConfig {

  val default = """
akka {
  home = ""
  version = "2.4-SNAPSHOT"
  loggers = ["akka.event.JSDefaultLogger"]
  logging-filter = "akka.event.JSDefaultLoggingFilter"
  loggers-dispatcher = "akka.actor.default-dispatcher"
  logger-startup-timeout = 5s
  loglevel = "INFO"
  stdout-loglevel = "DEBUG"
  log-config-on-start = off
  log-dead-letters = 0
  log-dead-letters-during-shutdown = off

  actor {
    provider = "akka.actor.JSLocalActorRefProvider"
    guardian-supervisor-strategy = "akka.actor.DefaultSupervisorStrategy"

    debug {
      receive = off
      autoreceive = off
      lifecycle = off
      event-stream = off
      unhandled = off
    }
  }
  scheduler {
    implementation = akka.actor.EventLoopScheduler
  }
}
"""

  import com.typesafe.config.{ Config, ConfigFactory }

  val config: Config = ConfigFactory.parseString(default)

}
