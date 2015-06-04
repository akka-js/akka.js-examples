package calculator

import org.scalatest.FunSuite

import org.scalatest._

import TweetLength.MaxTweetLength

class CalculatorSuite extends FunSuite with Matchers {

  /******************
   ** TWEET LENGTH **
   ******************/

  def tweetLength(text: String): Int =
    text.codePointCount(0, text.length)

  test("tweetRemainingCharsCount with a constant signal") {
    val result = TweetLength.tweetRemainingCharsCount("hello world")
    assert(result == MaxTweetLength - tweetLength("hello world"))

    val tooLong = "foo" * 200
    val result2 = TweetLength.tweetRemainingCharsCount(tooLong)
    assert(result2 == MaxTweetLength - tweetLength(tooLong))
  }

  test("tweetRemainingCharsCount with a supplementary char") {
    val result = TweetLength.tweetRemainingCharsCount("foo blabla \uD83D\uDCA9 bar")
    assert(result == MaxTweetLength - tweetLength("foo blabla \uD83D\uDCA9 bar"))
  }


  test("colorForRemainingCharsCount with a constant signal") {
    val resultGreen1 = TweetLength.colorForRemainingCharsCount(52)
    assert(resultGreen1 == "green")
    val resultGreen2 = TweetLength.colorForRemainingCharsCount(15)
    assert(resultGreen2 == "green")

    val resultOrange1 = TweetLength.colorForRemainingCharsCount(12)
    assert(resultOrange1 == "orange")
    val resultOrange2 = TweetLength.colorForRemainingCharsCount(0)
    assert(resultOrange2 == "orange")

    val resultRed1 = TweetLength.colorForRemainingCharsCount(-1)
    assert(resultRed1 == "red")
    val resultRed2 = TweetLength.colorForRemainingCharsCount(-5)
    assert(resultRed2 == "red")
  }

}
