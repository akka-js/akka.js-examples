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
  library-extensions = []
  extensions = []
  daemonic = off
  jvm-exit-on-fatal-error = on

  actor {
    provider = "akka.actor.JSLocalActorRefProvider"
    guardian-supervisor-strategy = "akka.actor.DefaultSupervisorStrategy"
    creation-timeout = 20s
    serialize-messages = off
    serialize-creators = off
    unstarted-push-timeout = 10s
    
    default-dispatcher {
      type = "Dispatcher"
      executor = "default-executor"
      default-executor {
        fallback = "fork-join-executor"
      }
      fork-join-executor {
        parallelism-min = 8
        parallelism-factor = 3.0
        parallelism-max = 64
        task-peeking-mode = "FIFO"
      }
      thread-pool-executor {
        keep-alive-time = 60s
        fixed-pool-size = off
        core-pool-size-min = 8
        core-pool-size-factor = 3.0
        core-pool-size-max = 64
        max-pool-size-min = 8
        max-pool-size-factor  = 3.0
        max-pool-size-max = 64
        task-queue-size = -1
        task-queue-type = "linked"
        allow-core-timeout = on
      }
      shutdown-timeout = 1s
      throughput = 5
      throughput-deadline-time = 0ms
      attempt-teamwork = on
      mailbox-requirement = ""
    }

    default-mailbox {
      mailbox-type = "akka.dispatch.UnboundedMailbox"
      mailbox-capacity = 1000
      mailbox-push-timeout-time = 10s
      stash-capacity = -1
    }
    debug {
      receive = off
      autoreceive = off
      lifecycle = off
      fsm = off
      event-stream = off
      unhandled = off
      router-misconfiguration = off
    }
  }
  scheduler {
    tick-duration = 10ms
    ticks-per-wheel = 512
    implementation = akka.actor.EventLoopScheduler
    shutdown-timeout = 5s
  }
}
"""

  import com.typesafe.config.{ Config, ConfigFactory }

  val config: Config = ConfigFactory.parseString(default)

}
