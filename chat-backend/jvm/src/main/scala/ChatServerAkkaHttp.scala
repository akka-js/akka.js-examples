package eu.unicredit

import akka.actor._

import akka.stream.ActorMaterializer
import akka.stream.scaladsl._
import akka.stream._
import akka.stream.actor._

import akka.http.scaladsl.Http
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.model.ws.{Message, TextMessage}

object ChatServerAkkaHttp {

  def run = {
    import ChatServer.system
    implicit val flowMaterializer = ActorMaterializer()
    import system.dispatcher

    case class SourceWSHandler() extends ActorPublisher[Message] {
      import ActorPublisherMessage._

      override def preStart() =
        ChatServer.manager ! ChatMsgs.AddClient(self)

      def receive = {
        case msg: ChatMsgs.Message =>
          onNext(TextMessage(msg.value))
      }

      override def postStop() =
        ChatServer.manager ! ChatMsgs.RemoveClient(self)
    }

    case class SinkWSHandler() extends ActorSubscriber {
      import ActorSubscriberMessage._

      override val requestStrategy = new MaxInFlightRequestStrategy(max = 1) {
        override def inFlightInternally: Int = 0
      }

      def receive = {
        case OnNext(TextMessage.Strict(text)) =>
          ChatServer.manager ! ChatMsgs.Message(s"Akka HTTP: $text")
      }
    }

    def actorSource =
      Source.actorPublisher[Message](Props(new SourceWSHandler()))
    def actorSink =
      Sink.actorSubscriber(Props(new SinkWSHandler()))

    def msgFlow(): Flow[Message,Message,Any] =
      Flow.fromSinkAndSource(actorSink, actorSource)

    val route =
      pathSingleSlash {
        get {
          handleWebSocketMessages(msgFlow)
        }
      }

    Http().bindAndHandle(route, "0.0.0.0", 9001)
  }
}
