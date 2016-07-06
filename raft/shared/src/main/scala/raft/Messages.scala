package raft

sealed trait RaftMessage


/* states */
sealed trait Role extends RaftMessage
case object Leader extends Role 
case object Follower extends Role
case object Candidate extends Role
case object Initialise extends Role

case class UIHeartbeat(from: Int) extends RaftMessage
case class UIState(from: Int, role: Role) extends RaftMessage
case class UIMessage(from: Int) extends RaftMessage