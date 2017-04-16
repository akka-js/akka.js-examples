package eu.unicredit

import scala.scalajs.js

object Main extends js.JSApp {

  val defaultConfig = akkajs.Config.default

  def main() = {
    println("JS env")

    Run.run
  }

}
