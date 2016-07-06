package eu.unicredit

import upickle._
import upickle.default._

import org.scalajs.dom.experimental.webrtc._

object Serializations {
  import upickle.Js
  implicit val sdpTypeWriter = Writer[RTCSdpType]{
    case r => Js.Str(r.toString)
  }
  implicit val sdpTypeReader = Reader[RTCSdpType]{
    case Js.Str(str) =>
      str match {
        case "offer" => RTCSdpType.offer
        case "pranswer" => RTCSdpType.pranswer
        case "answer" => RTCSdpType.answer
      }
  }

  implicit val rtcSessionWriter = Writer[RTCSessionDescription]{
    case r => Js.Obj(
      "type" -> sdpTypeWriter.write(r.`type`),
      "sdp" -> Js.Str(r.sdp)
      )
  }
  implicit val rtcSessionReader = Reader[RTCSessionDescription]{
    case obj: Js.Obj =>
      new RTCSessionDescription(
          RTCSessionDescriptionInit(
            read[RTCSdpType](obj("type").toString),
            obj("sdp").str
          )
      )
  }
}
