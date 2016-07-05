
package eu.unicredit

import scala.scalajs.js
import js.Dynamic.{literal, global => g}
import js.DynamicImplicits._

import akka.actor._

object ChatServerNode {

  def run = {
    import ChatServer.system

    val http = g.require("http")
    val WebSocketServer = g.require("websocket").server

    val server = http.createServer((request: js.Dynamic, response: js.Dynamic) => {
        response.writeHead(404)
        response.end("not available")
    })

    server.listen(9002, () => {
      js.Dynamic.newInstance(WebSocketServer)(literal(
        httpServer = server,
        autoAcceptConnections = false
      )).on("request", (request: js.Dynamic) => {
        system.actorOf(Props(WSHandler(request.accept(false, request.origin))))
      })
    })

    case class WSHandler(connection: js.Dynamic) extends Actor {

      override def preStart() = {
        connection.on("message", (message: js.Dynamic) => {
          ChatServer.manager ! ChatMsgs.Message(s"Node.JS: ${message.utf8Data.toString}")
        })

        connection.on("close", (reasonCode: js.Dynamic, description: js.Dynamic) => {
          self ! PoisonPill
        })

        ChatServer.manager ! ChatMsgs.AddClient(self)
      }

      override def postStop() = {
        ChatServer.manager ! ChatMsgs.RemoveClient(self)
      }

      def receive = {
        case ChatMsgs.Message(txt) =>
          connection.send(txt)
      }
    }

    ChatServer.manager
  }
}
