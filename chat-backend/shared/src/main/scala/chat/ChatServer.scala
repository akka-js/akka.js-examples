package eu.unicredit

import akka.actor._

object ChatMsgs {
  case class AddClient(ref: ActorRef)
  case class RemoveClient(ref: ActorRef)

  case class Message(value: String)
}

object ChatServer {

  implicit lazy val system = ActorSystem("chat")

  lazy val manager =
    system.actorOf(Props(Manager()), "manager")

  case class Manager() extends Actor {
    import ChatMsgs._

    def receive = operative()

    def operative(clients: List[ActorRef] = List()): Receive = {
      case AddClient(ref) =>
        context.become(operative(clients :+ ref))
      case RemoveClient(ref) =>
        context.become(operative(clients.filterNot(_ == ref)))
      case msg: Message =>
        clients.foreach{c => c ! msg}
    }
  }

}
