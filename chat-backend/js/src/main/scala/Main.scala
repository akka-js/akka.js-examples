package eu.unicredit

import scala.scalajs.js

object Main extends js.JSApp {

  def main() = {
    println("JS env")

    ChatServerNode.run
  }

}