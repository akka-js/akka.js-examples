/*
 *  Copyright (c) 2016 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */

/* More information about these options at jshint.com/docs/options */
/* jshint browser: true, camelcase: true, curly: true, devel: true,
   eqeqeq: true, forin: false, globalstrict: true, node: true,
   quotmark: single, undef: true, unused: strict */
/* global mozRTCIceCandidate, mozRTCPeerConnection, Promise,
mozRTCSessionDescription, webkitRTCPeerConnection, MediaStreamTrack,
MediaStream, RTCIceGatherer, RTCIceTransport, RTCDtlsTransport,
RTCRtpSender, RTCRtpReceiver*/
/* exported trace,requestUserMedia */

'use strict';

var getUserMedia = null;
var attachMediaStream = null;
var reattachMediaStream = null;
var webrtcDetectedBrowser = null;
var webrtcDetectedVersion = null;
var webrtcMinimumVersion = null;
var webrtcUtils = {
  log: function() {
    // suppress console.log output when being included as a module.
    if (typeof module !== 'undefined' ||
        typeof require === 'function' && typeof define === 'function') {
      return;
    }
    console.log.apply(console, arguments);
  },
  extractVersion: function(uastring, expr, pos) {
    var match = uastring.match(expr);
    return match && match.length >= pos && parseInt(match[pos], 10);
  }
};

function trace(text) {
  // This function is used for logging.
  if (text[text.length - 1] === '\n') {
    text = text.substring(0, text.length - 1);
  }
  if (window.performance) {
    var now = (window.performance.now() / 1000).toFixed(3);
    webrtcUtils.log(now + ': ' + text);
  } else {
    webrtcUtils.log(text);
  }
}

if (typeof window === 'object') {
  if (window.HTMLMediaElement &&
    !('srcObject' in window.HTMLMediaElement.prototype)) {
    // Shim the srcObject property, once, when HTMLMediaElement is found.
    Object.defineProperty(window.HTMLMediaElement.prototype, 'srcObject', {
      get: function() {
        // If prefixed srcObject property exists, return it.
        // Otherwise use the shimmed property, _srcObject
        return 'mozSrcObject' in this ? this.mozSrcObject : this._srcObject;
      },
      set: function(stream) {
        if ('mozSrcObject' in this) {
          this.mozSrcObject = stream;
        } else {
          // Use _srcObject as a private property for this shim
          this._srcObject = stream;
          // TODO: revokeObjectUrl(this.src) when !stream to release resources?
          this.src = URL.createObjectURL(stream);
        }
      }
    });
  }
  // Proxy existing globals
  getUserMedia = window.navigator && window.navigator.getUserMedia;
}

// Attach a media stream to an element.
attachMediaStream = function(element, stream) {
  element.srcObject = stream;
};

reattachMediaStream = function(to, from) {
  to.srcObject = from.srcObject;
};

if (typeof window === 'undefined' || !window.navigator) {
  webrtcUtils.log('This does not appear to be a browser');
  webrtcDetectedBrowser = 'not a browser';
} else if (navigator.mozGetUserMedia) {
  webrtcUtils.log('This appears to be Firefox');

  webrtcDetectedBrowser = 'firefox';

  // the detected firefox version.
  webrtcDetectedVersion = webrtcUtils.extractVersion(navigator.userAgent,
      /Firefox\/([0-9]+)\./, 1);

  // the minimum firefox version still supported by adapter.
  webrtcMinimumVersion = 31;

  // Shim for RTCPeerConnection on older versions.
  if (!window.RTCPeerConnection) {
    window.RTCPeerConnection = function(pcConfig, pcConstraints) {
      if (webrtcDetectedVersion < 38) {
        // .urls is not supported in FF < 38.
        // create RTCIceServers with a single url.
        if (pcConfig && pcConfig.iceServers) {
          var newIceServers = [];
          for (var i = 0; i < pcConfig.iceServers.length; i++) {
            var server = pcConfig.iceServers[i];
            if (server.hasOwnProperty('urls')) {
              for (var j = 0; j < server.urls.length; j++) {
                var newServer = {
                  url: server.urls[j]
                };
                if (server.urls[j].indexOf('turn') === 0) {
                  newServer.username = server.username;
                  newServer.credential = server.credential;
                }
                newIceServers.push(newServer);
              }
            } else {
              newIceServers.push(pcConfig.iceServers[i]);
            }
          }
          pcConfig.iceServers = newIceServers;
        }
      }
      return new mozRTCPeerConnection(pcConfig, pcConstraints); // jscs:ignore requireCapitalizedConstructors
    };

    // wrap static methods. Currently just generateCertificate.
    if (mozRTCPeerConnection.generateCertificate) {
      Object.defineProperty(window.RTCPeerConnection, 'generateCertificate', {
        get: function() {
          if (arguments.length) {
            return mozRTCPeerConnection.generateCertificate.apply(null,
                arguments);
          } else {
            return mozRTCPeerConnection.generateCertificate;
          }
        }
      });
    }

    window.RTCSessionDescription = mozRTCSessionDescription;
    window.RTCIceCandidate = mozRTCIceCandidate;
  }

  // getUserMedia constraints shim.
  getUserMedia = function(constraints, onSuccess, onError) {
    var constraintsToFF37 = function(c) {
      if (typeof c !== 'object' || c.require) {
        return c;
      }
      var require = [];
      Object.keys(c).forEach(function(key) {
        if (key === 'require' || key === 'advanced' || key === 'mediaSource') {
          return;
        }
        var r = c[key] = (typeof c[key] === 'object') ?
            c[key] : {ideal: c[key]};
        if (r.min !== undefined ||
            r.max !== undefined || r.exact !== undefined) {
          require.push(key);
        }
        if (r.exact !== undefined) {
          if (typeof r.exact === 'number') {
            r.min = r.max = r.exact;
          } else {
            c[key] = r.exact;
          }
          delete r.exact;
        }
        if (r.ideal !== undefined) {
          c.advanced = c.advanced || [];
          var oc = {};
          if (typeof r.ideal === 'number') {
            oc[key] = {min: r.ideal, max: r.ideal};
          } else {
            oc[key] = r.ideal;
          }
          c.advanced.push(oc);
          delete r.ideal;
          if (!Object.keys(r).length) {
            delete c[key];
          }
        }
      });
      if (require.length) {
        c.require = require;
      }
      return c;
    };
    if (webrtcDetectedVersion < 38) {
      webrtcUtils.log('spec: ' + JSON.stringify(constraints));
      if (constraints.audio) {
        constraints.audio = constraintsToFF37(constraints.audio);
      }
      if (constraints.video) {
        constraints.video = constraintsToFF37(constraints.video);
      }
      webrtcUtils.log('ff37: ' + JSON.stringify(constraints));
    }
    return navigator.mozGetUserMedia(constraints, onSuccess, onError);
  };

  navigator.getUserMedia = getUserMedia;

  // Shim for mediaDevices on older versions.
  if (!navigator.mediaDevices) {
    navigator.mediaDevices = {getUserMedia: requestUserMedia,
      addEventListener: function() { },
      removeEventListener: function() { }
    };
  }
  navigator.mediaDevices.enumerateDevices =
      navigator.mediaDevices.enumerateDevices || function() {
    return new Promise(function(resolve) {
      var infos = [
        {kind: 'audioinput', deviceId: 'default', label: '', groupId: ''},
        {kind: 'videoinput', deviceId: 'default', label: '', groupId: ''}
      ];
      resolve(infos);
    });
  };

  if (webrtcDetectedVersion < 41) {
    // Work around http://bugzil.la/1169665
    var orgEnumerateDevices =
        navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
    navigator.mediaDevices.enumerateDevices = function() {
      return orgEnumerateDevices().then(undefined, function(e) {
        if (e.name === 'NotFoundError') {
          return [];
        }
        throw e;
      });
    };
  }
} else if (navigator.webkitGetUserMedia && window.webkitRTCPeerConnection) {
  webrtcUtils.log('This appears to be Chrome');

  webrtcDetectedBrowser = 'chrome';

  // the detected chrome version.
  webrtcDetectedVersion = webrtcUtils.extractVersion(navigator.userAgent,
      /Chrom(e|ium)\/([0-9]+)\./, 2);

  // the minimum chrome version still supported by adapter.
  webrtcMinimumVersion = 38;

  // The RTCPeerConnection object.
  window.RTCPeerConnection = function(pcConfig, pcConstraints) {
    // Translate iceTransportPolicy to iceTransports,
    // see https://code.google.com/p/webrtc/issues/detail?id=4869
    if (pcConfig && pcConfig.iceTransportPolicy) {
      pcConfig.iceTransports = pcConfig.iceTransportPolicy;
    }

    var pc = new webkitRTCPeerConnection(pcConfig, pcConstraints); // jscs:ignore requireCapitalizedConstructors
    var origGetStats = pc.getStats.bind(pc);
    pc.getStats = function(selector, successCallback, errorCallback) { // jshint ignore: line
      var self = this;
      var args = arguments;

      // If selector is a function then we are in the old style stats so just
      // pass back the original getStats format to avoid breaking old users.
      if (arguments.length > 0 && typeof selector === 'function') {
        return origGetStats(selector, successCallback);
      }

      var fixChromeStats = function(response) {
        var standardReport = {};
        var reports = response.result();
        reports.forEach(function(report) {
          var standardStats = {
            id: report.id,
            timestamp: report.timestamp,
            type: report.type
          };
          report.names().forEach(function(name) {
            standardStats[name] = report.stat(name);
          });
          standardReport[standardStats.id] = standardStats;
        });

        return standardReport;
      };

      if (arguments.length >= 2) {
        var successCallbackWrapper = function(response) {
          args[1](fixChromeStats(response));
        };

        return origGetStats.apply(this, [successCallbackWrapper, arguments[0]]);
      }

      // promise-support
      return new Promise(function(resolve, reject) {
        if (args.length === 1 && selector === null) {
          origGetStats.apply(self, [
              function(response) {
                resolve.apply(null, [fixChromeStats(response)]);
              }, reject]);
        } else {
          origGetStats.apply(self, [resolve, reject]);
        }
      });
    };

    return pc;
  };

  // wrap static methods. Currently just generateCertificate.
  if (webkitRTCPeerConnection.generateCertificate) {
    Object.defineProperty(window.RTCPeerConnection, 'generateCertificate', {
      get: function() {
        if (arguments.length) {
          return webkitRTCPeerConnection.generateCertificate.apply(null,
              arguments);
        } else {
          return webkitRTCPeerConnection.generateCertificate;
        }
      }
    });
  }

  // add promise support
  ['createOffer', 'createAnswer'].forEach(function(method) {
    var nativeMethod = webkitRTCPeerConnection.prototype[method];
    webkitRTCPeerConnection.prototype[method] = function() {
      var self = this;
      if (arguments.length < 1 || (arguments.length === 1 &&
          typeof(arguments[0]) === 'object')) {
        var opts = arguments.length === 1 ? arguments[0] : undefined;
        return new Promise(function(resolve, reject) {
          nativeMethod.apply(self, [resolve, reject, opts]);
        });
      } else {
        return nativeMethod.apply(this, arguments);
      }
    };
  });

  ['setLocalDescription', 'setRemoteDescription',
      'addIceCandidate'].forEach(function(method) {
    var nativeMethod = webkitRTCPeerConnection.prototype[method];
    webkitRTCPeerConnection.prototype[method] = function() {
      var args = arguments;
      var self = this;
      return new Promise(function(resolve, reject) {
        nativeMethod.apply(self, [args[0],
            function() {
              resolve();
              if (args.length >= 2) {
                args[1].apply(null, []);
              }
            },
            function(err) {
              reject(err);
              if (args.length >= 3) {
                args[2].apply(null, [err]);
              }
            }]
          );
      });
    };
  });

  // getUserMedia constraints shim.
  var constraintsToChrome = function(c) {
    if (typeof c !== 'object' || c.mandatory || c.optional) {
      return c;
    }
    var cc = {};
    Object.keys(c).forEach(function(key) {
      if (key === 'require' || key === 'advanced' || key === 'mediaSource') {
        return;
      }
      var r = (typeof c[key] === 'object') ? c[key] : {ideal: c[key]};
      if (r.exact !== undefined && typeof r.exact === 'number') {
        r.min = r.max = r.exact;
      }
      var oldname = function(prefix, name) {
        if (prefix) {
          return prefix + name.charAt(0).toUpperCase() + name.slice(1);
        }
        return (name === 'deviceId') ? 'sourceId' : name;
      };
      if (r.ideal !== undefined) {
        cc.optional = cc.optional || [];
        var oc = {};
        if (typeof r.ideal === 'number') {
          oc[oldname('min', key)] = r.ideal;
          cc.optional.push(oc);
          oc = {};
          oc[oldname('max', key)] = r.ideal;
          cc.optional.push(oc);
        } else {
          oc[oldname('', key)] = r.ideal;
          cc.optional.push(oc);
        }
      }
      if (r.exact !== undefined && typeof r.exact !== 'number') {
        cc.mandatory = cc.mandatory || {};
        cc.mandatory[oldname('', key)] = r.exact;
      } else {
        ['min', 'max'].forEach(function(mix) {
          if (r[mix] !== undefined) {
            cc.mandatory = cc.mandatory || {};
            cc.mandatory[oldname(mix, key)] = r[mix];
          }
        });
      }
    });
    if (c.advanced) {
      cc.optional = (cc.optional || []).concat(c.advanced);
    }
    return cc;
  };

  getUserMedia = function(constraints, onSuccess, onError) {
    if (constraints.audio) {
      constraints.audio = constraintsToChrome(constraints.audio);
    }
    if (constraints.video) {
      constraints.video = constraintsToChrome(constraints.video);
    }
    webrtcUtils.log('chrome: ' + JSON.stringify(constraints));
    return navigator.webkitGetUserMedia(constraints, onSuccess, onError);
  };
  navigator.getUserMedia = getUserMedia;

  if (!navigator.mediaDevices) {
    navigator.mediaDevices = {getUserMedia: requestUserMedia,
                              enumerateDevices: function() {
      return new Promise(function(resolve) {
        var kinds = {audio: 'audioinput', video: 'videoinput'};
        return MediaStreamTrack.getSources(function(devices) {
          resolve(devices.map(function(device) {
            return {label: device.label,
                    kind: kinds[device.kind],
                    deviceId: device.id,
                    groupId: ''};
          }));
        });
      });
    }};
  }

  // A shim for getUserMedia method on the mediaDevices object.
  // TODO(KaptenJansson) remove once implemented in Chrome stable.
  if (!navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia = function(constraints) {
      return requestUserMedia(constraints);
    };
  } else {
    // Even though Chrome 45 has navigator.mediaDevices and a getUserMedia
    // function which returns a Promise, it does not accept spec-style
    // constraints.
    var origGetUserMedia = navigator.mediaDevices.getUserMedia.
        bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = function(c) {
      webrtcUtils.log('spec:   ' + JSON.stringify(c)); // whitespace for alignment
      c.audio = constraintsToChrome(c.audio);
      c.video = constraintsToChrome(c.video);
      webrtcUtils.log('chrome: ' + JSON.stringify(c));
      return origGetUserMedia(c);
    };
  }

  // Dummy devicechange event methods.
  // TODO(KaptenJansson) remove once implemented in Chrome stable.
  if (typeof navigator.mediaDevices.addEventListener === 'undefined') {
    navigator.mediaDevices.addEventListener = function() {
      webrtcUtils.log('Dummy mediaDevices.addEventListener called.');
    };
  }
  if (typeof navigator.mediaDevices.removeEventListener === 'undefined') {
    navigator.mediaDevices.removeEventListener = function() {
      webrtcUtils.log('Dummy mediaDevices.removeEventListener called.');
    };
  }

  // Attach a media stream to an element.
  attachMediaStream = function(element, stream) {
    if (webrtcDetectedVersion >= 43) {
      element.srcObject = stream;
    } else if (typeof element.src !== 'undefined') {
      element.src = URL.createObjectURL(stream);
    } else {
      webrtcUtils.log('Error attaching stream to element.');
    }
  };
  reattachMediaStream = function(to, from) {
    if (webrtcDetectedVersion >= 43) {
      to.srcObject = from.srcObject;
    } else {
      to.src = from.src;
    }
  };

} else if (navigator.mediaDevices && navigator.userAgent.match(
    /Edge\/(\d+).(\d+)$/)) {
  webrtcUtils.log('This appears to be Edge');
  webrtcDetectedBrowser = 'edge';

  webrtcDetectedVersion = webrtcUtils.extractVersion(navigator.userAgent,
      /Edge\/(\d+).(\d+)$/, 2);

  // The minimum version still supported by adapter.
  // This is the build number for Edge.
  webrtcMinimumVersion = 10547;

  if (window.RTCIceGatherer) {
    // Generate an alphanumeric identifier for cname or mids.
    // TODO: use UUIDs instead? https://gist.github.com/jed/982883
    var generateIdentifier = function() {
      return Math.random().toString(36).substr(2, 10);
    };

    // The RTCP CNAME used by all peerconnections from the same JS.
    var localCName = generateIdentifier();

    // SDP helpers - to be moved into separate module.
    var SDPUtils = {};

    // Splits SDP into lines, dealing with both CRLF and LF.
    SDPUtils.splitLines = function(blob) {
      return blob.trim().split('\n').map(function(line) {
        return line.trim();
      });
    };

    // Splits SDP into sessionpart and mediasections. Ensures CRLF.
    SDPUtils.splitSections = function(blob) {
      var parts = blob.split('\r\nm=');
      return parts.map(function(part, index) {
        return (index > 0 ? 'm=' + part : part).trim() + '\r\n';
      });
    };

    // Returns lines that start with a certain prefix.
    SDPUtils.matchPrefix = function(blob, prefix) {
      return SDPUtils.splitLines(blob).filter(function(line) {
        return line.indexOf(prefix) === 0;
      });
    };

    // Parses an ICE candidate line. Sample input:
    // candidate:702786350 2 udp 41819902 8.8.8.8 60769 typ relay raddr 8.8.8.8 rport 55996"
    SDPUtils.parseCandidate = function(line) {
      var parts;
      // Parse both variants.
      if (line.indexOf('a=candidate:') === 0) {
        parts = line.substring(12).split(' ');
      } else {
        parts = line.substring(10).split(' ');
      }

      var candidate = {
        foundation: parts[0],
        component: parts[1],
        protocol: parts[2].toLowerCase(),
        priority: parseInt(parts[3], 10),
        ip: parts[4],
        port: parseInt(parts[5], 10),
        // skip parts[6] == 'typ'
        type: parts[7]
      };

      for (var i = 8; i < parts.length; i += 2) {
        switch (parts[i]) {
          case 'raddr':
            candidate.relatedAddress = parts[i + 1];
            break;
          case 'rport':
            candidate.relatedPort = parseInt(parts[i + 1], 10);
            break;
          case 'tcptype':
            candidate.tcpType = parts[i + 1];
            break;
          default: // Unknown extensions are silently ignored.
            break;
        }
      }
      return candidate;
    };

    // Translates a candidate object into SDP candidate attribute.
    SDPUtils.writeCandidate = function(candidate) {
      var sdp = [];
      sdp.push(candidate.foundation);
      sdp.push(candidate.component);
      sdp.push(candidate.protocol.toUpperCase());
      sdp.push(candidate.priority);
      sdp.push(candidate.ip);
      sdp.push(candidate.port);

      var type = candidate.type;
      sdp.push('typ');
      sdp.push(type);
      if (type !== 'host' && candidate.relatedAddress &&
          candidate.relatedPort) {
        sdp.push('raddr');
        sdp.push(candidate.relatedAddress); // was: relAddr
        sdp.push('rport');
        sdp.push(candidate.relatedPort); // was: relPort
      }
      if (candidate.tcpType && candidate.protocol.toLowerCase() === 'tcp') {
        sdp.push('tcptype');
        sdp.push(candidate.tcpType);
      }
      return 'candidate:' + sdp.join(' ');
    };

    // Parses an rtpmap line, returns RTCRtpCoddecParameters. Sample input:
    // a=rtpmap:111 opus/48000/2
    SDPUtils.parseRtpMap = function(line) {
      var parts = line.substr(9).split(' ');
      var parsed = {
        payloadType: parseInt(parts.shift(), 10) // was: id
      };

      parts = parts[0].split('/');

      parsed.name = parts[0];
      parsed.clockRate = parseInt(parts[1], 10); // was: clockrate
      parsed.numChannels = parts.length === 3 ? parseInt(parts[2], 10) : 1; // was: channels
      return parsed;
    };

    // Generate an a=rtpmap line from RTCRtpCodecCapability or RTCRtpCodecParameters.
    SDPUtils.writeRtpMap = function(codec) {
      var pt = codec.payloadType;
      if (codec.preferredPayloadType !== undefined) {
        pt = codec.preferredPayloadType;
      }
      return 'a=rtpmap:' + pt + ' ' + codec.name + '/' + codec.clockRate +
          (codec.numChannels !== 1 ? '/' + codec.numChannels : '') + '\r\n';
    };

    // Parses an ftmp line, returns dictionary. Sample input:
    // a=fmtp:96 vbr=on;cng=on
    // Also deals with vbr=on; cng=on
    SDPUtils.parseFmtp = function(line) {
      var parsed = {};
      var kv;
      var parts = line.substr(line.indexOf(' ') + 1).split(';');
      for (var j = 0; j < parts.length; j++) {
        kv = parts[j].trim().split('=');
        parsed[kv[0].trim()] = kv[1];
      }
      return parsed;
    };

    // Generates an a=ftmp line from RTCRtpCodecCapability or RTCRtpCodecParameters.
    SDPUtils.writeFtmp = function(codec) {
      var line = '';
      var pt = codec.payloadType;
      if (codec.preferredPayloadType !== undefined) {
        pt = codec.preferredPayloadType;
      }
      if (codec.parameters && codec.parameters.length) {
        var params = [];
        Object.keys(codec.parameters).forEach(function(param) {
          params.push(param + '=' + codec.parameters[param]);
        });
        line += 'a=fmtp:' + pt + ' ' + params.join(';') + '\r\n';
      }
      return line;
    };

    // Parses an rtcp-fb line, returns RTCPRtcpFeedback object. Sample input:
    // a=rtcp-fb:98 nack rpsi
    SDPUtils.parseRtcpFb = function(line) {
      var parts = line.substr(line.indexOf(' ') + 1).split(' ');
      return {
        type: parts.shift(),
        parameter: parts.join(' ')
      };
    };
    // Generate a=rtcp-fb lines from RTCRtpCodecCapability or RTCRtpCodecParameters.
    SDPUtils.writeRtcpFb = function(codec) {
      var lines = '';
      var pt = codec.payloadType;
      if (codec.preferredPayloadType !== undefined) {
        pt = codec.preferredPayloadType;
      }
      if (codec.rtcpFeedback && codec.rtcpFeedback.length) {
        // FIXME: special handling for trr-int?
        codec.rtcpFeedback.forEach(function(fb) {
          lines += 'a=rtcp-fb:' + pt + ' ' + fb.type + ' ' + fb.parameter +
              '\r\n';
        });
      }
      return lines;
    };

    // Parses an RFC 5576 ssrc media attribute. Sample input:
    // a=ssrc:3735928559 cname:something
    SDPUtils.parseSsrcMedia = function(line) {
      var sp = line.indexOf(' ');
      var parts = {
        ssrc: line.substr(7, sp - 7),
      };
      var colon = line.indexOf(':', sp);
      if (colon > -1) {
        parts.attribute = line.substr(sp + 1, colon - sp - 1);
        parts.value = line.substr(colon + 1);
      } else {
        parts.attribute = line.substr(sp + 1);
      }
      return parts;
    };

    // Extracts DTLS parameters from SDP media section or sessionpart.
    // FIXME: for consistency with other functions this should only
    //   get the fingerprint line as input. See also getIceParameters.
    SDPUtils.getDtlsParameters = function(mediaSection, sessionpart) {
      var lines = SDPUtils.splitLines(mediaSection);
      lines = lines.concat(SDPUtils.splitLines(sessionpart)); // Search in session part, too.
      var fpLine = lines.filter(function(line) {
        return line.indexOf('a=fingerprint:') === 0;
      })[0].substr(14);
      // Note: a=setup line is ignored since we use the 'auto' role.
      var dtlsParameters = {
        role: 'auto',
        fingerprints: [{
          algorithm: fpLine.split(' ')[0],
          value: fpLine.split(' ')[1]
        }]
      };
      return dtlsParameters;
    };

    // Serializes DTLS parameters to SDP.
    SDPUtils.writeDtlsParameters = function(params, setupType) {
      var sdp = 'a=setup:' + setupType + '\r\n';
      params.fingerprints.forEach(function(fp) {
        sdp += 'a=fingerprint:' + fp.algorithm + ' ' + fp.value + '\r\n';
      });
      return sdp;
    };
    // Parses ICE information from SDP media section or sessionpart.
    // FIXME: for consistency with other functions this should only
    //   get the ice-ufrag and ice-pwd lines as input.
    SDPUtils.getIceParameters = function(mediaSection, sessionpart) {
      var lines = SDPUtils.splitLines(mediaSection);
      lines = lines.concat(SDPUtils.splitLines(sessionpart)); // Search in session part, too.
      var iceParameters = {
        usernameFragment: lines.filter(function(line) {
          return line.indexOf('a=ice-ufrag:') === 0;
        })[0].substr(12),
        password: lines.filter(function(line) {
          return line.indexOf('a=ice-pwd:') === 0;
        })[0].substr(10)
      };
      return iceParameters;
    };

    // Serializes ICE parameters to SDP.
    SDPUtils.writeIceParameters = function(params) {
      return 'a=ice-ufrag:' + params.usernameFragment + '\r\n' +
          'a=ice-pwd:' + params.password + '\r\n';
    };

    // Parses the SDP media section and returns RTCRtpParameters.
    SDPUtils.parseRtpParameters = function(mediaSection) {
      var description = {
        codecs: [],
        headerExtensions: [],
        fecMechanisms: [],
        rtcp: []
      };
      var lines = SDPUtils.splitLines(mediaSection);
      var mline = lines[0].split(' ');
      for (var i = 3; i < mline.length; i++) { // find all codecs from mline[3..]
        var pt = mline[i];
        var rtpmapline = SDPUtils.matchPrefix(
            mediaSection, 'a=rtpmap:' + pt + ' ')[0];
        if (rtpmapline) {
          var codec = SDPUtils.parseRtpMap(rtpmapline);
          var fmtps = SDPUtils.matchPrefix(
              mediaSection, 'a=fmtp:' + pt + ' ');
          // Only the first a=fmtp:<pt> is considered.
          codec.parameters = fmtps.length ? SDPUtils.parseFmtp(fmtps[0]) : {};
          codec.rtcpFeedback = SDPUtils.matchPrefix(
              mediaSection, 'a=rtcp-fb:' + pt + ' ')
            .map(SDPUtils.parseRtcpFb);
          description.codecs.push(codec);
        }
      }
      // FIXME: parse headerExtensions, fecMechanisms and rtcp.
      return description;
    };

    // Generates parts of the SDP media section describing the capabilities / parameters.
    SDPUtils.writeRtpDescription = function(kind, caps) {
      var sdp = '';

      // Build the mline.
      sdp += 'm=' + kind + ' ';
      sdp += caps.codecs.length > 0 ? '9' : '0'; // reject if no codecs.
      sdp += ' UDP/TLS/RTP/SAVPF ';
      sdp += caps.codecs.map(function(codec) {
        if (codec.preferredPayloadType !== undefined) {
          return codec.preferredPayloadType;
        }
        return codec.payloadType;
      }).join(' ') + '\r\n';

      sdp += 'c=IN IP4 0.0.0.0\r\n';
      sdp += 'a=rtcp:9 IN IP4 0.0.0.0\r\n';

      // Add a=rtpmap lines for each codec. Also fmtp and rtcp-fb.
      caps.codecs.forEach(function(codec) {
        sdp += SDPUtils.writeRtpMap(codec);
        sdp += SDPUtils.writeFtmp(codec);
        sdp += SDPUtils.writeRtcpFb(codec);
      });
      // FIXME: add headerExtensions, fecMechanismş and rtcp.
      sdp += 'a=rtcp-mux\r\n';
      return sdp;
    };

    SDPUtils.writeSessionBoilerplate = function() {
      // FIXME: sess-id should be an NTP timestamp.
      return 'v=0\r\n' +
          'o=thisisadapterortc 8169639915646943137 2 IN IP4 127.0.0.1\r\n' +
          's=-\r\n' +
          't=0 0\r\n';
    };

    SDPUtils.writeMediaSection = function(transceiver, caps, type, stream) {
      var sdp = SDPUtils.writeRtpDescription(transceiver.kind, caps);

      // Map ICE parameters (ufrag, pwd) to SDP.
      sdp += SDPUtils.writeIceParameters(
          transceiver.iceGatherer.getLocalParameters());

      // Map DTLS parameters to SDP.
      sdp += SDPUtils.writeDtlsParameters(
          transceiver.dtlsTransport.getLocalParameters(),
          type === 'offer' ? 'actpass' : 'active');

      sdp += 'a=mid:' + transceiver.mid + '\r\n';

      if (transceiver.rtpSender && transceiver.rtpReceiver) {
        sdp += 'a=sendrecv\r\n';
      } else if (transceiver.rtpSender) {
        sdp += 'a=sendonly\r\n';
      } else if (transceiver.rtpReceiver) {
        sdp += 'a=recvonly\r\n';
      } else {
        sdp += 'a=inactive\r\n';
      }

      // FIXME: for RTX there might be multiple SSRCs. Not implemented in Edge yet.
      if (transceiver.rtpSender) {
        var msid = 'msid:' + stream.id + ' ' +
            transceiver.rtpSender.track.id + '\r\n';
        sdp += 'a=' + msid;
        sdp += 'a=ssrc:' + transceiver.sendSsrc + ' ' + msid;
      }
      // FIXME: this should be written by writeRtpDescription.
      sdp += 'a=ssrc:' + transceiver.sendSsrc + ' cname:' +
          localCName + '\r\n';
      return sdp;
    };

    // Gets the direction from the mediaSection or the sessionpart.
    SDPUtils.getDirection = function(mediaSection, sessionpart) {
      // Look for sendrecv, sendonly, recvonly, inactive, default to sendrecv.
      var lines = SDPUtils.splitLines(mediaSection);
      for (var i = 0; i < lines.length; i++) {
        switch (lines[i]) {
          case 'a=sendrecv':
          case 'a=sendonly':
          case 'a=recvonly':
          case 'a=inactive':
            return lines[i].substr(2);
        }
      }
      if (sessionpart) {
        return SDPUtils.getDirection(sessionpart);
      }
      return 'sendrecv';
    };

    // ORTC defines an RTCIceCandidate object but no constructor.
    // Not implemented in Edge.
    if (!window.RTCIceCandidate) {
      window.RTCIceCandidate = function(args) {
        return args;
      };
    }
    // ORTC does not have a session description object but
    // other browsers (i.e. Chrome) that will support both PC and ORTC
    // in the future might have this defined already.
    if (!window.RTCSessionDescription) {
      window.RTCSessionDescription = function(args) {
        return args;
      };
    }

    window.RTCPeerConnection = function(config) {
      var self = this;

      this.onicecandidate = null;
      this.onaddstream = null;
      this.onremovestream = null;
      this.onsignalingstatechange = null;
      this.oniceconnectionstatechange = null;
      this.onnegotiationneeded = null;
      this.ondatachannel = null;

      this.localStreams = [];
      this.remoteStreams = [];
      this.getLocalStreams = function() { return self.localStreams; };
      this.getRemoteStreams = function() { return self.remoteStreams; };

      this.localDescription = new RTCSessionDescription({
        type: '',
        sdp: ''
      });
      this.remoteDescription = new RTCSessionDescription({
        type: '',
        sdp: ''
      });
      this.signalingState = 'stable';
      this.iceConnectionState = 'new';

      this.iceOptions = {
        gatherPolicy: 'all',
        iceServers: []
      };
      if (config && config.iceTransportPolicy) {
        switch (config.iceTransportPolicy) {
          case 'all':
          case 'relay':
            this.iceOptions.gatherPolicy = config.iceTransportPolicy;
            break;
          case 'none':
            // FIXME: remove once implementation and spec have added this.
            throw new TypeError('iceTransportPolicy "none" not supported');
        }
      }
      if (config && config.iceServers) {
        // Edge does not like
        // 1) stun:
        // 2) turn: that does not have all of turn:host:port?transport=udp
        // 3) an array of urls
        config.iceServers.forEach(function(server) {
          if (server.urls) {
            var url;
            if (typeof(server.urls) === 'string') {
              url = server.urls;
            } else {
              url = server.urls[0];
            }
            if (url.indexOf('transport=udp') !== -1) {
              self.iceServers.push({
                username: server.username,
                credential: server.credential,
                urls: url
              });
            }
          }
        });
      }

      // per-track iceGathers, iceTransports, dtlsTransports, rtpSenders, ...
      // everything that is needed to describe a SDP m-line.
      this.transceivers = [];

      // since the iceGatherer is currently created in createOffer but we
      // must not emit candidates until after setLocalDescription we buffer
      // them in this array.
      this._localIceCandidatesBuffer = [];
    };

    window.RTCPeerConnection.prototype._emitBufferedCandidates = function() {
      var self = this;
      // FIXME: need to apply ice candidates in a way which is async but in-order
      this._localIceCandidatesBuffer.forEach(function(event) {
        if (self.onicecandidate !== null) {
          self.onicecandidate(event);
        }
      });
      this._localIceCandidatesBuffer = [];
    };

    window.RTCPeerConnection.prototype.addStream = function(stream) {
      // Clone is necessary for local demos mostly, attaching directly
      // to two different senders does not work (build 10547).
      this.localStreams.push(stream.clone());
      this._maybeFireNegotiationNeeded();
    };

    window.RTCPeerConnection.prototype.removeStream = function(stream) {
      var idx = this.localStreams.indexOf(stream);
      if (idx > -1) {
        this.localStreams.splice(idx, 1);
        this._maybeFireNegotiationNeeded();
      }
    };

    // Determines the intersection of local and remote capabilities.
    window.RTCPeerConnection.prototype._getCommonCapabilities =
        function(localCapabilities, remoteCapabilities) {
      var commonCapabilities = {
        codecs: [],
        headerExtensions: [],
        fecMechanisms: []
      };
      localCapabilities.codecs.forEach(function(lCodec) {
        for (var i = 0; i < remoteCapabilities.codecs.length; i++) {
          var rCodec = remoteCapabilities.codecs[i];
          if (lCodec.name.toLowerCase() === rCodec.name.toLowerCase() &&
              lCodec.clockRate === rCodec.clockRate &&
              lCodec.numChannels === rCodec.numChannels) {
            // push rCodec so we reply with offerer payload type
            commonCapabilities.codecs.push(rCodec);

            // FIXME: also need to determine intersection between
            // .rtcpFeedback and .parameters
            break;
          }
        }
      });

      localCapabilities.headerExtensions.forEach(function(lHeaderExtension) {
        for (var i = 0; i < remoteCapabilities.headerExtensions.length; i++) {
          var rHeaderExtension = remoteCapabilities.headerExtensions[i];
          if (lHeaderExtension.uri === rHeaderExtension.uri) {
            commonCapabilities.headerExtensions.push(rHeaderExtension);
            break;
          }
        }
      });

      // FIXME: fecMechanisms
      return commonCapabilities;
    };

    // Create ICE gatherer, ICE transport and DTLS transport.
    window.RTCPeerConnection.prototype._createIceAndDtlsTransports =
        function(mid, sdpMLineIndex) {
      var self = this;
      var iceGatherer = new RTCIceGatherer(self.iceOptions);
      var iceTransport = new RTCIceTransport(iceGatherer);
      iceGatherer.onlocalcandidate = function(evt) {
        var event = {};
        event.candidate = {sdpMid: mid, sdpMLineIndex: sdpMLineIndex};

        var cand = evt.candidate;
        // Edge emits an empty object for RTCIceCandidateComplete‥
        if (!cand || Object.keys(cand).length === 0) {
          // polyfill since RTCIceGatherer.state is not implemented in Edge 10547 yet.
          if (iceGatherer.state === undefined) {
            iceGatherer.state = 'completed';
          }

          // Emit a candidate with type endOfCandidates to make the samples work.
          // Edge requires addIceCandidate with this empty candidate to start checking.
          // The real solution is to signal end-of-candidates to the other side when
          // getting the null candidate but some apps (like the samples) don't do that.
          event.candidate.candidate =
              'candidate:1 1 udp 1 0.0.0.0 9 typ endOfCandidates';
        } else {
          // RTCIceCandidate doesn't have a component, needs to be added
          cand.component = iceTransport.component === 'RTCP' ? 2 : 1;
          event.candidate.candidate = SDPUtils.writeCandidate(cand);
        }

        var complete = self.transceivers.every(function(transceiver) {
          return transceiver.iceGatherer &&
              transceiver.iceGatherer.state === 'completed';
        });
        // FIXME: update .localDescription with candidate and (potentially) end-of-candidates.
        //     To make this harder, the gatherer might emit candidates before localdescription
        //     is set. To make things worse, gather.getLocalCandidates still errors in
        //     Edge 10547 when no candidates have been gathered yet.

        if (self.onicecandidate !== null) {
          // Emit candidate if localDescription is set.
          // Also emits null candidate when all gatherers are complete.
          if (self.localDescription && self.localDescription.type === '') {
            self._localIceCandidatesBuffer.push(event);
            if (complete) {
              self._localIceCandidatesBuffer.push({});
            }
          } else {
            self.onicecandidate(event);
            if (complete) {
              self.onicecandidate({});
            }
          }
        }
      };
      iceTransport.onicestatechange = function() {
        self._updateConnectionState();
      };

      var dtlsTransport = new RTCDtlsTransport(iceTransport);
      dtlsTransport.ondtlsstatechange = function() {
        self._updateConnectionState();
      };
      dtlsTransport.onerror = function() {
        // onerror does not set state to failed by itself.
        dtlsTransport.state = 'failed';
        self._updateConnectionState();
      };

      return {
        iceGatherer: iceGatherer,
        iceTransport: iceTransport,
        dtlsTransport: dtlsTransport
      };
    };

    // Start the RTP Sender and Receiver for a transceiver.
    window.RTCPeerConnection.prototype._transceive = function(transceiver,
        send, recv) {
      var params = this._getCommonCapabilities(transceiver.localCapabilities,
          transceiver.remoteCapabilities);
      if (send && transceiver.rtpSender) {
        params.encodings = [{
          ssrc: transceiver.sendSsrc
        }];
        params.rtcp = {
          cname: localCName,
          ssrc: transceiver.recvSsrc
        };
        transceiver.rtpSender.send(params);
      }
      if (recv && transceiver.rtpReceiver) {
        params.encodings = [{
          ssrc: transceiver.recvSsrc
        }];
        params.rtcp = {
          cname: transceiver.cname,
          ssrc: transceiver.sendSsrc
        };
        transceiver.rtpReceiver.receive(params);
      }
    };

    window.RTCPeerConnection.prototype.setLocalDescription =
        function(description) {
      var self = this;
      if (description.type === 'offer') {
        if (!this._pendingOffer) {
        } else {
          this.transceivers = this._pendingOffer;
          delete this._pendingOffer;
        }
      } else if (description.type === 'answer') {
        var sections = SDPUtils.splitSections(self.remoteDescription.sdp);
        var sessionpart = sections.shift();
        sections.forEach(function(mediaSection, sdpMLineIndex) {
          var transceiver = self.transceivers[sdpMLineIndex];
          var iceGatherer = transceiver.iceGatherer;
          var iceTransport = transceiver.iceTransport;
          var dtlsTransport = transceiver.dtlsTransport;
          var localCapabilities = transceiver.localCapabilities;
          var remoteCapabilities = transceiver.remoteCapabilities;
          var rejected = mediaSection.split('\n', 1)[0]
              .split(' ', 2)[1] === '0';

          if (!rejected) {
            var remoteIceParameters = SDPUtils.getIceParameters(mediaSection,
                sessionpart);
            iceTransport.start(iceGatherer, remoteIceParameters, 'controlled');

            var remoteDtlsParameters = SDPUtils.getDtlsParameters(mediaSection,
              sessionpart);
            dtlsTransport.start(remoteDtlsParameters);

            // Calculate intersection of capabilities.
            var params = self._getCommonCapabilities(localCapabilities,
                remoteCapabilities);

            // Start the RTCRtpSender. The RTCRtpReceiver for this transceiver
            // has already been started in setRemoteDescription.
            self._transceive(transceiver,
                params.codecs.length > 0,
                false);
          }
        });
      }

      this.localDescription = description;
      switch (description.type) {
        case 'offer':
          this._updateSignalingState('have-local-offer');
          break;
        case 'answer':
          this._updateSignalingState('stable');
          break;
        default:
          throw new TypeError('unsupported type "' + description.type + '"');
      }

      // If a success callback was provided, emit ICE candidates after it has been
      // executed. Otherwise, emit callback after the Promise is resolved.
      var hasCallback = arguments.length > 1 &&
        typeof arguments[1] === 'function';
      if (hasCallback) {
        var cb = arguments[1];
        window.setTimeout(function() {
          cb();
          self._emitBufferedCandidates();
        }, 0);
      }
      var p = Promise.resolve();
      p.then(function() {
        if (!hasCallback) {
          window.setTimeout(self._emitBufferedCandidates.bind(self), 0);
        }
      });
      return p;
    };

    window.RTCPeerConnection.prototype.setRemoteDescription =
        function(description) {
      var self = this;
      var stream = new MediaStream();
      var sections = SDPUtils.splitSections(description.sdp);
      var sessionpart = sections.shift();
      sections.forEach(function(mediaSection, sdpMLineIndex) {
        var lines = SDPUtils.splitLines(mediaSection);
        var mline = lines[0].substr(2).split(' ');
        var kind = mline[0];
        var rejected = mline[1] === '0';
        var direction = SDPUtils.getDirection(mediaSection, sessionpart);

        var transceiver;
        var iceGatherer;
        var iceTransport;
        var dtlsTransport;
        var rtpSender;
        var rtpReceiver;
        var sendSsrc;
        var recvSsrc;
        var localCapabilities;

        // FIXME: ensure the mediaSection has rtcp-mux set.
        var remoteCapabilities = SDPUtils.parseRtpParameters(mediaSection);
        var remoteIceParameters;
        var remoteDtlsParameters;
        if (!rejected) {
          remoteIceParameters = SDPUtils.getIceParameters(mediaSection,
              sessionpart);
          remoteDtlsParameters = SDPUtils.getDtlsParameters(mediaSection,
              sessionpart);
        }
        var mid = SDPUtils.matchPrefix(mediaSection, 'a=mid:')[0].substr(6);

        var cname;
        // Gets the first SSRC. Note that with RTX there might be multiple SSRCs.
        var remoteSsrc = SDPUtils.matchPrefix(mediaSection, 'a=ssrc:')
            .map(function(line) {
              return SDPUtils.parseSsrcMedia(line);
            })
            .filter(function(obj) {
              return obj.attribute === 'cname';
            })[0];
        if (remoteSsrc) {
          recvSsrc = parseInt(remoteSsrc.ssrc, 10);
          cname = remoteSsrc.value;
        }

        if (description.type === 'offer') {
          var transports = self._createIceAndDtlsTransports(mid, sdpMLineIndex);

          localCapabilities = RTCRtpReceiver.getCapabilities(kind);
          sendSsrc = (2 * sdpMLineIndex + 2) * 1001;

          rtpReceiver = new RTCRtpReceiver(transports.dtlsTransport, kind);

          // FIXME: not correct when there are multiple streams but that is
          // not currently supported in this shim.
          stream.addTrack(rtpReceiver.track);

          // FIXME: look at direction.
          if (self.localStreams.length > 0 &&
              self.localStreams[0].getTracks().length >= sdpMLineIndex) {
            // FIXME: actually more complicated, needs to match types etc
            var localtrack = self.localStreams[0].getTracks()[sdpMLineIndex];
            rtpSender = new RTCRtpSender(localtrack, transports.dtlsTransport);
          }

          self.transceivers[sdpMLineIndex] = {
            iceGatherer: transports.iceGatherer,
            iceTransport: transports.iceTransport,
            dtlsTransport: transports.dtlsTransport,
            localCapabilities: localCapabilities,
            remoteCapabilities: remoteCapabilities,
            rtpSender: rtpSender,
            rtpReceiver: rtpReceiver,
            kind: kind,
            mid: mid,
            cname: cname,
            sendSsrc: sendSsrc,
            recvSsrc: recvSsrc
          };
          // Start the RTCRtpReceiver now. The RTPSender is started in setLocalDescription.
          self._transceive(self.transceivers[sdpMLineIndex],
              false,
              direction === 'sendrecv' || direction === 'sendonly');
        } else if (description.type === 'answer' && !rejected) {
          transceiver = self.transceivers[sdpMLineIndex];
          iceGatherer = transceiver.iceGatherer;
          iceTransport = transceiver.iceTransport;
          dtlsTransport = transceiver.dtlsTransport;
          rtpSender = transceiver.rtpSender;
          rtpReceiver = transceiver.rtpReceiver;
          sendSsrc = transceiver.sendSsrc;
          //recvSsrc = transceiver.recvSsrc;
          localCapabilities = transceiver.localCapabilities;

          self.transceivers[sdpMLineIndex].recvSsrc = recvSsrc;
          self.transceivers[sdpMLineIndex].remoteCapabilities =
              remoteCapabilities;
          self.transceivers[sdpMLineIndex].cname = cname;

          iceTransport.start(iceGatherer, remoteIceParameters, 'controlling');
          dtlsTransport.start(remoteDtlsParameters);

          self._transceive(transceiver,
              direction === 'sendrecv' || direction === 'recvonly',
              direction === 'sendrecv' || direction === 'sendonly');

          if (rtpReceiver &&
              (direction === 'sendrecv' || direction === 'sendonly')) {
            stream.addTrack(rtpReceiver.track);
          } else {
            // FIXME: actually the receiver should be created later.
            delete transceiver.rtpReceiver;
          }
        }
      });

      this.remoteDescription = description;
      switch (description.type) {
        case 'offer':
          this._updateSignalingState('have-remote-offer');
          break;
        case 'answer':
          this._updateSignalingState('stable');
          break;
        default:
          throw new TypeError('unsupported type "' + description.type + '"');
      }
      window.setTimeout(function() {
        if (self.onaddstream !== null && stream.getTracks().length) {
          self.remoteStreams.push(stream);
          window.setTimeout(function() {
            self.onaddstream({stream: stream});
          }, 0);
        }
      }, 0);
      if (arguments.length > 1 && typeof arguments[1] === 'function') {
        window.setTimeout(arguments[1], 0);
      }
      return Promise.resolve();
    };

    window.RTCPeerConnection.prototype.close = function() {
      this.transceivers.forEach(function(transceiver) {
        /* not yet
        if (transceiver.iceGatherer) {
          transceiver.iceGatherer.close();
        }
        */
        if (transceiver.iceTransport) {
          transceiver.iceTransport.stop();
        }
        if (transceiver.dtlsTransport) {
          transceiver.dtlsTransport.stop();
        }
        if (transceiver.rtpSender) {
          transceiver.rtpSender.stop();
        }
        if (transceiver.rtpReceiver) {
          transceiver.rtpReceiver.stop();
        }
      });
      // FIXME: clean up tracks, local streams, remote streams, etc
      this._updateSignalingState('closed');
    };

    // Update the signaling state.
    window.RTCPeerConnection.prototype._updateSignalingState =
        function(newState) {
      this.signalingState = newState;
      if (this.onsignalingstatechange !== null) {
        this.onsignalingstatechange();
      }
    };

    // Determine whether to fire the negotiationneeded event.
    window.RTCPeerConnection.prototype._maybeFireNegotiationNeeded =
        function() {
      // Fire away (for now).
      if (this.onnegotiationneeded !== null) {
        this.onnegotiationneeded();
      }
    };

    // Update the connection state.
    window.RTCPeerConnection.prototype._updateConnectionState =
        function() {
      var self = this;
      var newState;
      var states = {
        'new': 0,
        closed: 0,
        connecting: 0,
        checking: 0,
        connected: 0,
        completed: 0,
        failed: 0
      };
      this.transceivers.forEach(function(transceiver) {
        states[transceiver.iceTransport.state]++;
        states[transceiver.dtlsTransport.state]++;
      });
      // ICETransport.completed and connected are the same for this purpose.
      states.connected += states.completed;

      newState = 'new';
      if (states.failed > 0) {
        newState = 'failed';
      } else if (states.connecting > 0 || states.checking > 0) {
        newState = 'connecting';
      } else if (states.disconnected > 0) {
        newState = 'disconnected';
      } else if (states.new > 0) {
        newState = 'new';
      } else if (states.connecting > 0 || states.completed > 0) {
        newState = 'connected';
      }

      if (newState !== self.iceConnectionState) {
        self.iceConnectionState = newState;
        if (this.oniceconnectionstatechange !== null) {
          this.oniceconnectionstatechange();
        }
      }
    };

    window.RTCPeerConnection.prototype.createOffer = function() {
      var self = this;
      if (this._pendingOffer) {
        throw new Error('createOffer called while there is a pending offer.');
      }
      var offerOptions;
      if (arguments.length === 1 && typeof arguments[0] !== 'function') {
        offerOptions = arguments[0];
      } else if (arguments.length === 3) {
        offerOptions = arguments[2];
      }

      var tracks = [];
      var numAudioTracks = 0;
      var numVideoTracks = 0;
      // Default to sendrecv.
      if (this.localStreams.length) {
        numAudioTracks = this.localStreams[0].getAudioTracks().length;
        numVideoTracks = this.localStreams[0].getVideoTracks().length;
      }
      // Determine number of audio and video tracks we need to send/recv.
      if (offerOptions) {
        // Reject Chrome legacy constraints.
        if (offerOptions.mandatory || offerOptions.optional) {
          throw new TypeError(
              'Legacy mandatory/optional constraints not supported.');
        }
        if (offerOptions.offerToReceiveAudio !== undefined) {
          numAudioTracks = offerOptions.offerToReceiveAudio;
        }
        if (offerOptions.offerToReceiveVideo !== undefined) {
          numVideoTracks = offerOptions.offerToReceiveVideo;
        }
      }
      if (this.localStreams.length) {
        // Push local streams.
        this.localStreams[0].getTracks().forEach(function(track) {
          tracks.push({
            kind: track.kind,
            track: track,
            wantReceive: track.kind === 'audio' ?
                numAudioTracks > 0 : numVideoTracks > 0
          });
          if (track.kind === 'audio') {
            numAudioTracks--;
          } else if (track.kind === 'video') {
            numVideoTracks--;
          }
        });
      }
      // Create M-lines for recvonly streams.
      while (numAudioTracks > 0 || numVideoTracks > 0) {
        if (numAudioTracks > 0) {
          tracks.push({
            kind: 'audio',
            wantReceive: true
          });
          numAudioTracks--;
        }
        if (numVideoTracks > 0) {
          tracks.push({
            kind: 'video',
            wantReceive: true
          });
          numVideoTracks--;
        }
      }

      var sdp = SDPUtils.writeSessionBoilerplate();
      var transceivers = [];
      tracks.forEach(function(mline, sdpMLineIndex) {
        // For each track, create an ice gatherer, ice transport, dtls transport,
        // potentially rtpsender and rtpreceiver.
        var track = mline.track;
        var kind = mline.kind;
        var mid = generateIdentifier();

        var transports = self._createIceAndDtlsTransports(mid, sdpMLineIndex);

        var localCapabilities = RTCRtpSender.getCapabilities(kind);
        var rtpSender;
        var rtpReceiver;

        // generate an ssrc now, to be used later in rtpSender.send
        var sendSsrc = (2 * sdpMLineIndex + 1) * 1001;
        if (track) {
          rtpSender = new RTCRtpSender(track, transports.dtlsTransport);
        }

        if (mline.wantReceive) {
          rtpReceiver = new RTCRtpReceiver(transports.dtlsTransport, kind);
        }

        transceivers[sdpMLineIndex] = {
          iceGatherer: transports.iceGatherer,
          iceTransport: transports.iceTransport,
          dtlsTransport: transports.dtlsTransport,
          localCapabilities: localCapabilities,
          remoteCapabilities: null,
          rtpSender: rtpSender,
          rtpReceiver: rtpReceiver,
          kind: kind,
          mid: mid,
          sendSsrc: sendSsrc,
          recvSsrc: null
        };
        var transceiver = transceivers[sdpMLineIndex];
        sdp += SDPUtils.writeMediaSection(transceiver,
            transceiver.localCapabilities, 'offer', self.localStreams[0]);
      });

      this._pendingOffer = transceivers;
      var desc = new RTCSessionDescription({
        type: 'offer',
        sdp: sdp
      });
      if (arguments.length && typeof arguments[0] === 'function') {
        window.setTimeout(arguments[0], 0, desc);
      }
      return Promise.resolve(desc);
    };

    window.RTCPeerConnection.prototype.createAnswer = function() {
      var self = this;
      var answerOptions;
      if (arguments.length === 1 && typeof arguments[0] !== 'function') {
        answerOptions = arguments[0];
      } else if (arguments.length === 3) {
        answerOptions = arguments[2];
      }

      var sdp = SDPUtils.writeSessionBoilerplate();
      this.transceivers.forEach(function(transceiver) {
        // Calculate intersection of capabilities.
        var commonCapabilities = self._getCommonCapabilities(
            transceiver.localCapabilities,
            transceiver.remoteCapabilities);

        sdp += SDPUtils.writeMediaSection(transceiver, commonCapabilities,
            'answer', self.localStreams[0]);
      });

      var desc = new RTCSessionDescription({
        type: 'answer',
        sdp: sdp
      });
      if (arguments.length && typeof arguments[0] === 'function') {
        window.setTimeout(arguments[0], 0, desc);
      }
      return Promise.resolve(desc);
    };

    window.RTCPeerConnection.prototype.addIceCandidate = function(candidate) {
      var mLineIndex = candidate.sdpMLineIndex;
      if (candidate.sdpMid) {
        for (var i = 0; i < this.transceivers.length; i++) {
          if (this.transceivers[i].mid === candidate.sdpMid) {
            mLineIndex = i;
            break;
          }
        }
      }
      var transceiver = this.transceivers[mLineIndex];
      if (transceiver) {
        var cand = Object.keys(candidate.candidate).length > 0 ?
            SDPUtils.parseCandidate(candidate.candidate) : {};
        // Ignore Chrome's invalid candidates since Edge does not like them.
        if (cand.protocol === 'tcp' && cand.port === 0) {
          return;
        }
        // Ignore RTCP candidates, we assume RTCP-MUX.
        if (cand.component !== '1') {
          return;
        }
        // A dirty hack to make samples work.
        if (cand.type === 'endOfCandidates') {
          cand = {};
        }
        transceiver.iceTransport.addRemoteCandidate(cand);
      }
      if (arguments.length > 1 && typeof arguments[1] === 'function') {
        window.setTimeout(arguments[1], 0);
      }
      return Promise.resolve();
    };

    window.RTCPeerConnection.prototype.getStats = function() {
      var promises = [];
      this.transceivers.forEach(function(transceiver) {
        ['rtpSender', 'rtpReceiver', 'iceGatherer', 'iceTransport',
            'dtlsTransport'].forEach(function(method) {
          if (transceiver[method]) {
            promises.push(transceiver[method].getStats());
          }
        });
      });
      var cb = arguments.length > 1 && typeof arguments[1] === 'function' &&
          arguments[1];
      return new Promise(function(resolve) {
        var results = {};
        Promise.all(promises).then(function(res) {
          res.forEach(function(result) {
            Object.keys(result).forEach(function(id) {
              results[id] = result[id];
            });
          });
          if (cb) {
            window.setTimeout(cb, 0, results);
          }
          resolve(results);
        });
      });
    };
  }
} else {
  webrtcUtils.log('Browser does not appear to be WebRTC-capable');
}

// Returns the result of getUserMedia as a Promise.
function requestUserMedia(constraints) {
  return new Promise(function(resolve, reject) {
    getUserMedia(constraints, resolve, reject);
  });
}

var webrtcTesting = {};
try {
  Object.defineProperty(webrtcTesting, 'version', {
    set: function(version) {
      webrtcDetectedVersion = version;
    }
  });
} catch (e) {}

if (typeof module !== 'undefined') {
  var RTCPeerConnection;
  var RTCIceCandidate;
  var RTCSessionDescription;
  if (typeof window !== 'undefined') {
    RTCPeerConnection = window.RTCPeerConnection;
    RTCIceCandidate = window.RTCIceCandidate;
    RTCSessionDescription = window.RTCSessionDescription;
  }
  module.exports = {
    RTCPeerConnection: RTCPeerConnection,
    RTCIceCandidate: RTCIceCandidate,
    RTCSessionDescription: RTCSessionDescription,
    getUserMedia: getUserMedia,
    attachMediaStream: attachMediaStream,
    reattachMediaStream: reattachMediaStream,
    webrtcDetectedBrowser: webrtcDetectedBrowser,
    webrtcDetectedVersion: webrtcDetectedVersion,
    webrtcMinimumVersion: webrtcMinimumVersion,
    webrtcTesting: webrtcTesting,
    webrtcUtils: webrtcUtils
    //requestUserMedia: not exposed on purpose.
    //trace: not exposed on purpose.
  };
} else if ((typeof require === 'function') && (typeof define === 'function')) {
  // Expose objects and functions when RequireJS is doing the loading.
  define([], function() {
    return {
      RTCPeerConnection: window.RTCPeerConnection,
      RTCIceCandidate: window.RTCIceCandidate,
      RTCSessionDescription: window.RTCSessionDescription,
      getUserMedia: getUserMedia,
      attachMediaStream: attachMediaStream,
      reattachMediaStream: reattachMediaStream,
      webrtcDetectedBrowser: webrtcDetectedBrowser,
      webrtcDetectedVersion: webrtcDetectedVersion,
      webrtcMinimumVersion: webrtcMinimumVersion,
      webrtcTesting: webrtcTesting,
      webrtcUtils: webrtcUtils
      //requestUserMedia: not exposed on purpose.
      //trace: not exposed on purpose.
    };
  });
}

(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";function _interopRequireDefault(e){return e&&e.__esModule?e:{"default":e}}var _bar=require("./bar"),_bar2=_interopRequireDefault(_bar),_bezier=require("./bezier"),_bezier2=_interopRequireDefault(_bezier),_connector=require("./connector"),_connector2=_interopRequireDefault(_connector),_curvedRectangle=require("./curved-rectangle"),_curvedRectangle2=_interopRequireDefault(_curvedRectangle),_graph=require("./graph"),_graph2=_interopRequireDefault(_graph),_linear=require("./linear"),_linear2=_interopRequireDefault(_linear),_path=require("./path"),_path2=_interopRequireDefault(_path),_pie=require("./pie"),_pie2=_interopRequireDefault(_pie),_polygon=require("./polygon"),_polygon2=_interopRequireDefault(_polygon),_radar=require("./radar"),_radar2=_interopRequireDefault(_radar),_rectangle=require("./rectangle"),_rectangle2=_interopRequireDefault(_rectangle),_sankey=require("./sankey"),_sankey2=_interopRequireDefault(_sankey),_sector=require("./sector"),_sector2=_interopRequireDefault(_sector),_semiRegularPolygon=require("./semi-regular-polygon"),_semiRegularPolygon2=_interopRequireDefault(_semiRegularPolygon),_smoothLine=require("./smooth-line"),_smoothLine2=_interopRequireDefault(_smoothLine),_stack=require("./stack"),_stack2=_interopRequireDefault(_stack),_stock=require("./stock"),_stock2=_interopRequireDefault(_stock),_tree=require("./tree"),_tree2=_interopRequireDefault(_tree),_voronoi=require("./voronoi"),_voronoi2=_interopRequireDefault(_voronoi),_waterfall=require("./waterfall"),_waterfall2=_interopRequireDefault(_waterfall);!function(){var e=(1,eval)("this");e.Paths={Bar:_bar2["default"],Bezier:_bezier2["default"],Connector:_connector2["default"],CurvedRectangle:_curvedRectangle2["default"],Graph:_graph2["default"],Linear:_linear2["default"],Path:_path2["default"],Pie:_pie2["default"],Polygon:_polygon2["default"],Radar:_radar2["default"],Rectangle:_rectangle2["default"],Sankey:_sankey2["default"],Sector:_sector2["default"],SemiRegularPolygon:_semiRegularPolygon2["default"],SmoothLine:_smoothLine2["default"],Stack:_stack2["default"],Stock:_stock2["default"],Tree:_tree2["default"],Voronoi:_voronoi2["default"],Waterfall:_waterfall2["default"]}}();
},{"./bar":2,"./bezier":5,"./connector":7,"./curved-rectangle":8,"./graph":12,"./linear":14,"./path":16,"./pie":17,"./polygon":18,"./radar":19,"./rectangle":20,"./sankey":21,"./sector":22,"./semi-regular-polygon":24,"./smooth-line":25,"./stack":26,"./stock":27,"./tree":29,"./voronoi":30,"./waterfall":31}],2:[function(require,module,exports){
"use strict";function _interopRequireDefault(r){return r&&r.__esModule?r:{"default":r}}Object.defineProperty(exports,"__esModule",{value:!0});var _slicedToArray=function(){function r(r,e){var t=[],n=!0,a=!1,i=void 0;try{for(var l,o=r[Symbol.iterator]();!(n=(l=o.next()).done)&&(t.push(l.value),!e||t.length!==e);n=!0);}catch(u){a=!0,i=u}finally{try{!n&&o["return"]&&o["return"]()}finally{if(a)throw i}}return t}return function(e,t){if(Array.isArray(e))return e;if(Symbol.iterator in Object(e))return r(e,t);throw new TypeError("Invalid attempt to destructure non-iterable instance")}}(),_linear=require("./linear"),_linear2=_interopRequireDefault(_linear),_rectangle=require("./rectangle"),_rectangle2=_interopRequireDefault(_rectangle),_ops=require("./ops");exports["default"]=function(r){var e=r.data,t=r.accessor,n=void 0===t?_ops.id:t,a=r.width,i=r.height,l=r.min,o=r.max,u=r.gutter,f=void 0===u?10:u,c=r.compute,y=[],d=!1,s=!1;null==l&&(l=0,d=!0),null==o&&(o=0,s=!0);var v=!0,_=!1,h=void 0;try{for(var p,m=e.entries()[Symbol.iterator]();!(v=(p=m.next()).done);v=!0){var g=_slicedToArray(p.value,2),x=g[0],b=g[1],w=!0,A=!1,q=void 0;try{for(var S,T=b.entries()[Symbol.iterator]();!(w=(S=T.next()).done);w=!0){var D=_slicedToArray(S.value,2),R=D[0],j=D[1],M=n(j);d&&l>M&&(l=M),s&&M>o&&(o=M),null==y[R]&&(y[R]=[]),y[R][x]=M}}catch(O){A=!0,q=O}finally{try{!w&&T["return"]&&T["return"]()}finally{if(A)throw q}}}}catch(O){_=!0,h=O}finally{try{!v&&m["return"]&&m["return"]()}finally{if(_)throw h}}var E=y.length,I=(a-f*(E-1))/E,P=[],k=(0,_linear2["default"])([l,o],[i,0]),z=!0,B=!1,C=void 0;try{for(var F,G=y.entries()[Symbol.iterator]();!(z=(F=G.next()).done);z=!0){var H=_slicedToArray(F.value,2),x=H[0],J=H[1],K=I/J.length,L=(I+f)*x,N=!0,Q=!1,U=void 0;try{for(var V,W=J.entries()[Symbol.iterator]();!(N=(V=W.next()).done);N=!0){var X=_slicedToArray(V.value,2),R=X[0],j=X[1],Y=L+K*R,Z=Y+K,$=k(0),rr=k(j),er=(0,_rectangle2["default"])({left:Y,right:Z,bottom:$,top:rr});P.push((0,_ops.enhance)(c,{item:e[R][x],line:er,group:x,index:R}))}}catch(O){Q=!0,U=O}finally{try{!N&&W["return"]&&W["return"]()}finally{if(Q)throw U}}}}catch(O){B=!0,C=O}finally{try{!z&&G["return"]&&G["return"]()}finally{if(B)throw C}}return{curves:P,scale:k}},module.exports=exports["default"];
},{"./linear":14,"./ops":15,"./rectangle":20}],3:[function(require,module,exports){
"use strict";Object.defineProperty(exports,"__esModule",{value:!0});var _slicedToArray=function(){function r(r,e){var t=[],o=!0,n=!1,i=void 0;try{for(var a,s=r[Symbol.iterator]();!(o=(a=s.next()).done)&&(t.push(a.value),!e||t.length!==e);o=!0);}catch(u){n=!0,i=u}finally{try{!o&&s["return"]&&s["return"]()}finally{if(n)throw i}}return t}return function(e,t){if(Array.isArray(e))return e;if(Symbol.iterator in Object(e))return r(e,t);throw new TypeError("Invalid attempt to destructure non-iterable instance")}}(),_ops=require("./ops"),average=function(r,e){var t=r.mass+e.mass,o=(0,_ops.times)(1/t,(0,_ops.plus)((0,_ops.times)(r.mass,r.point),(0,_ops.times)(e.mass,e.point)));return[o,t]},locate=function(r,e){var t=_slicedToArray(r,2),o=t[0],n=t[1],i=!0,a=!1,s=void 0;try{for(var u,d=e[Symbol.iterator]();!(i=(u=d.next()).done);i=!0){var l=u.value,f=l.box,c=f.top,p=f.bottom,m=f.left,y=f.right;if(o>=m&&y>=o&&n>=p&&c>=n)return l}}catch(v){a=!0,s=v}finally{try{!i&&d["return"]&&d["return"]()}finally{if(a)throw s}}},makeQuadrant=function(r,e){var t=r.top,o=r.bottom,n=r.left,i=r.right,a=_slicedToArray(e,2),s=a[0],u=a[1],d=(n+i)/2,l=(t+o)/2;return{box:{top:u?l:t,bottom:u?o:l,left:s?d:n,right:s?i:d}}},subdivide=function(r){var e=r.box;return[makeQuadrant(e,[0,0]),makeQuadrant(e,[1,0]),makeQuadrant(e,[0,1]),makeQuadrant(e,[1,1])]},addBody=function r(e,t){if(e.body){var o=e.body;delete e.body,e.children=subdivide(e),r(e,o),r(e,t)}else if(e.children){var n=locate(t.point,e.children),i=e.point?average(e,t):[t.point,t.mass],a=_slicedToArray(i,2),s=a[0],u=a[1];e.point=s,e.mass=u,r(n,t)}else e.body=t},makeTree=function(r,e){for(var t=!0;t;){var o=r,n=e;if(t=!1,0===o.length)return n;var i=o.shift();addBody(n,i),r=o,e=n,t=!0,i=void 0}},makeBodies=function(r){return(0,_ops.mapObject)(r,function(r,e){return{id:r,point:e,mass:1}})},makeRoot=function(r,e){return{box:{top:e,bottom:0,left:0,right:r}}},walkLeaves=function e(r,t){if(r.body)t(r);else if(r.children){var o=!0,n=!1,i=void 0;try{for(var a,s=r.children[Symbol.iterator]();!(o=(a=s.next()).done);o=!0){var u=a.value;e(u,t)}}catch(d){n=!0,i=d}finally{try{!o&&s["return"]&&s["return"]()}finally{if(n)throw i}}}},bodyForceOn=function(r,e,t){var o=(0,_ops.minus)(r.point,e.point),n=(0,_ops.length)(o);return(0,_ops.times)(t*r.mass*e.mass/(n*n*n),o)},boxWidth=function(r){var e=r.top,t=r.bottom,o=r.left,n=r.right;return(0,_ops.length)([e-t,n-o])},forceOn=function t(r,e,o,n){if(e===r)return[0,0];if(e.body)return bodyForceOn(r.body,e.body,o);if(e.point){var i=boxWidth(e.box),a=(0,_ops.length)((0,_ops.minus)(r.body.point,e.point));return n>i/a?bodyForceOn(r.body,e,o):(0,_ops.sumVectors)(e.children.map(function(e){return t(r,e,o,n)}))}return[0,0]},repulsiveForces=function(r,e,t){var o={};return walkLeaves(r,function(n){o[n.body.id]=forceOn(n,r,e,t)}),o};exports.tree=makeTree,exports.bodies=makeBodies,exports.root=makeRoot,exports.forces=repulsiveForces,exports["default"]={tree:makeTree,bodies:makeBodies,root:makeRoot,forces:repulsiveForces};
},{"./ops":15}],4:[function(require,module,exports){
"use strict";function _interopRequireDefault(e){return e&&e.__esModule?e:{"default":e}}function Beachline(e,t,r,i,n){_binarytree2["default"].call(this,e,t,r,i),this.cEvent=n}Object.defineProperty(exports,"__esModule",{value:!0});var _binarytree=require("./binarytree"),_binarytree2=_interopRequireDefault(_binarytree),_segment=require("./segment"),_segment2=_interopRequireDefault(_segment),_geom=require("./geom"),_geom2=_interopRequireDefault(_geom);Beachline.prototype=Object.create(_binarytree2["default"].prototype),Beachline.prototype.isLeaf=function(){return void 0===this.l},Beachline.prototype.getArcNodeOnSite=function(e){for(var t=this,r=void 0;!t.isLeaf();)r=t.item.pl[1]<t.item.pr[1]?0:1,t=e[0]<_geom2["default"].parabolsCrossX(t.item.pl,t.item.pr,e[1])[r]?t.l:t.r;return t},Beachline.prototype.addArc=function(e,t){var r=t[0],i=t[1],n=t[2],a=i.item,o=[e[0],e[1]-_geom2["default"].distPointToParabol(e,a)],l=new _segment2["default"](a,e,o),d=new _segment2["default"](e,a,o);i.item=l,i.addLChild(new Beachline(a)),i.addRChild(new Beachline(d)),i.r.addLChild(new Beachline(e)),i.r.addRChild(new Beachline(a)),void 0!=r&&void 0!=r.cEvent&&(r.cEvent.arcsNodes[2]=i.l),void 0!=n&&void 0!=n.cEvent&&(n.cEvent.arcsNodes[0]=i.r.r)},Beachline.prototype.rmArc=function(e,t,r){var i=t[0],n=t[1],a=t[2];if(n.isRChild())var o=r[0].l,l=r[0],d=r[1];else var o=r[1].r,l=r[1],d=r[0];d.item=new _segment2["default"](i.item,a.item,e),l.isRChild()?l.parent.r=o:l.parent.l=o,o.parent=l.parent},exports["default"]=Beachline,module.exports=exports["default"];
},{"./binarytree":6,"./geom":11,"./segment":23}],5:[function(require,module,exports){
"use strict";function _interopRequireDefault(e){return e&&e.__esModule?e:{"default":e}}function _toConsumableArray(e){if(Array.isArray(e)){for(var r=0,o=Array(e.length);r<e.length;r++)o[r]=e[r];return o}return Array.from(e)}Object.defineProperty(exports,"__esModule",{value:!0});var _path=require("./path"),_path2=_interopRequireDefault(_path),_polygon=require("./polygon"),_polygon2=_interopRequireDefault(_polygon),_ops=require("./ops"),reflect=function(e,r){return(0,_ops.minus)((0,_ops.times)(2,e),r)};exports["default"]=function(e){var r,o=e.points,t=e.tension;t=t||.3;var u=[],n=o.length;if(2>=n)return(0,_polygon2["default"])({points:o});for(var p=1;n-1>=p;p++)u.push((0,_ops.times)(t,(0,_ops.minus)(o[p],o[p-1])));for(var a=[(0,_ops.plus)(o[0],reflect(u[0],u[1]))],p=1;n-2>=p;p++)a.push((0,_ops.minus)(o[p],(0,_ops.average)([u[p],u[p-1]])));a.push((0,_ops.minus)(o[n-1],reflect(u[n-2],u[n-3])));var s=a[0],i=a[1],_=o[0],l=o[1],f=(r=(0,_path2["default"])()).moveto.apply(r,_toConsumableArray(_)).curveto(s[0],s[1],i[0],i[1],l[0],l[1]);return{path:(0,_ops.range)(2,n).reduce(function(e,r){var t=a[r],u=o[r];return e.smoothcurveto(t[0],t[1],u[0],u[1])},f),centroid:(0,_ops.average)(o)}},module.exports=exports["default"];
},{"./ops":15,"./path":16,"./polygon":18}],6:[function(require,module,exports){
"use strict";function BinaryTree(t,r,e,i){this.item=t,this.parent=r,this.l=e,this.r=i}Object.defineProperty(exports,"__esModule",{value:!0}),BinaryTree.prototype.isRoot=function(){return void 0===this.parent},BinaryTree.prototype.isLeaf=function(){return void 0===this.l&&void 0===this.r},BinaryTree.prototype.isLChild=function(){return!this.isRoot()&&this.parent.l===this},BinaryTree.prototype.isRChild=function(){return!this.isRoot()&&this.parent.r===this},BinaryTree.prototype.addLChild=function(t){this.l=t,t.parent=this},BinaryTree.prototype.addRChild=function(t){this.r=t,t.parent=this},BinaryTree.prototype.getLLeafAndLParent=function(t){for(var r=t||this;r.isLChild();)r=r.parent;if(r.isRoot())return[void 0,void 0];var e=r.parent;for(r=r.parent.l;!r.isLeaf();)r=r.r;return[r,e]},BinaryTree.prototype.getRLeafAndRParent=function(t){for(var r=t||this;r.isRChild();)r=r.parent;if(r.isRoot())return[void 0,void 0];var e=r.parent;for(r=r.parent.r;!r.isLeaf();)r=r.l;return[r,e]},exports["default"]=BinaryTree,module.exports=exports["default"];
},{}],7:[function(require,module,exports){
"use strict";function _interopRequireDefault(r){return r&&r.__esModule?r:{"default":r}}function _toConsumableArray(r){if(Array.isArray(r)){for(var e=0,t=Array(r.length);e<r.length;e++)t[e]=r[e];return t}return Array.from(r)}Object.defineProperty(exports,"__esModule",{value:!0});var _slicedToArray=function(){function r(r,e){var t=[],a=!0,n=!1,o=void 0;try{for(var u,i=r[Symbol.iterator]();!(a=(u=i.next()).done)&&(t.push(u.value),!e||t.length!==e);a=!0);}catch(l){n=!0,o=l}finally{try{!a&&i["return"]&&i["return"]()}finally{if(n)throw o}}return t}return function(e,t){if(Array.isArray(e))return e;if(Symbol.iterator in Object(e))return r(e,t);throw new TypeError("Invalid attempt to destructure non-iterable instance")}}(),_path=require("./path"),_path2=_interopRequireDefault(_path),_ops=require("./ops");exports["default"]=function(r){var e,t,a,n=r.start,o=r.end,u=r.tension;null==u&&(u=.05);var i=_slicedToArray(n,2),l=i[0],p=i[1],s=_slicedToArray(o,2),y=s[0],f=s[1],c=(y-l)*u,_=[l+c,p];return{path:(e=(t=(a=(0,_path2["default"])()).moveto.apply(a,_toConsumableArray(n))).lineto.apply(t,_).curveto(l+5*c,p,y-5*c,f,y-c,f)).lineto.apply(e,_toConsumableArray(o)),centroid:(0,_ops.average)([n,o])}},module.exports=exports["default"];
},{"./ops":15,"./path":16}],8:[function(require,module,exports){
"use strict";function _interopRequireDefault(e){return e&&e.__esModule?e:{"default":e}}Object.defineProperty(exports,"__esModule",{value:!0});var _path=require("./path"),_path2=_interopRequireDefault(_path),_connector=require("./connector"),_connector2=_interopRequireDefault(_connector),_ops=require("./ops");exports["default"]=function(e){var t=e.topleft,o=e.topright,r=e.bottomleft,n=e.bottomright,a=(0,_connector2["default"])({start:t,end:o}).path,u=(0,_connector2["default"])({start:n,end:r}).path,p=a.connect(u).closepath(),c=(0,_ops.average)([t,o,r,n]);return{path:p,centroid:c}},module.exports=exports["default"];
},{"./connector":7,"./ops":15,"./path":16}],9:[function(require,module,exports){
"use strict";function _interopRequireDefault(e){return e&&e.__esModule?e:{"default":e}}function Event(e,o,t){2==e.length?this.coord=e:(this.arcsNodes=[e[0],e[2],e[4]],this.edgesNodes=[e[1],e[3]],this.vertexCoord=t,this.coord=o),Event.prototype.goToEventIndex=function(e,o){o=o||1e-10;for(var t=0;t<e.length&&this.coord[1]>e[t].coord[1]+o;)t++;return t},Event.prototype.add=function(e){e.splice(this.goToEventIndex(e),0,this)},Event.prototype.rm=function(e){for(var o=this.goToEventIndex(e);o<e.length;){if(o==e.length-1||this.coord[1]!=e[o+1].coord[1]||this.arcsNodes==e[o].arcsNodes&&this.coord[0]===e[o].coord[0]&&this.coord[1]===e[o].coord[1])return e.splice(o,1);o++}console.log("Event does not exist in list")},Event.prototype.toString=function(){return this.edgesNodes?"Circle event. Vertex: "+this.vertexCoord+"; coord:"+this.coord:"Site event. Coord:"+this.coord}}Object.defineProperty(exports,"__esModule",{value:!0});var _geom=require("./geom"),_geom2=_interopRequireDefault(_geom);exports["default"]=Event,module.exports=exports["default"];
},{"./geom":11}],10:[function(require,module,exports){
"use strict";function _interopRequireDefault(e){return e&&e.__esModule?e:{"default":e}}function Fortune(e){this.sites=e,this.events=[],this.beach=new _beachline2["default"],this.edges=[],this.patches=Object.create(null),this.iterations=0,e.forEach(function(e){this.patches[e]=[],new _event2["default"](e).add(this.events)},this)}Object.defineProperty(exports,"__esModule",{value:!0});var _beachline=require("./beachline"),_beachline2=_interopRequireDefault(_beachline),_geom=require("./geom"),_geom2=_interopRequireDefault(_geom),_event=require("./event"),_event2=_interopRequireDefault(_event);Fortune.prototype.addCircleEvent=function(e,t,i){void 0===e&&(e=1e-10);var r=e.getLLeafAndLParent(),s=r[0],n=r[1],o=e.getRLeafAndRParent(),a=o[0],c=o[1];if(void 0!==s&&void 0!==a&&(s.item[0]!==a.item[0]||s.item[1]!==a.item[1])&&_geom2["default"].doHalflinesCross(n.item,c.item)){var h=_geom2["default"].circumCenter(s.item,e.item,a.item);if(h[1]!=1/0){var d=[h[0],h[1]+_geom2["default"].distPointToPoint(e.item,h)];d[1]<t-i||(e.cEvent=new _event2["default"]([s,n,e,c,a],d,h),e.cEvent.add(this.events))}}},Fortune.prototype.rmCircleEvent=function(e){void 0!==e.cEvent&&(e.cEvent.rm(this.events),e.cEvent=void 0)},Fortune.prototype.manageSiteEvent=function(){var e=this.events.splice(0,1)[0],t=this.beach.getArcNodeOnSite(e.coord),i=t.getLLeafAndLParent()[0],r=t.getRLeafAndRParent()[0];this.rmCircleEvent(t),this.beach.addArc(e.coord,[i,t,r]),this.addCircleEvent(t.l,e.coord[1]),this.addCircleEvent(t.r.r,e.coord[1])},Fortune.prototype.manageCircleEvent=function(){var e=this.events.splice(0,1)[0],t=e.edgesNodes[0].item,i=e.edgesNodes[1].item;t.pe=e.vertexCoord,i.pe=e.vertexCoord,this.edges.push(t),this.edges.push(i),this.beach.rmArc(e.vertexCoord,e.arcsNodes,e.edgesNodes),this.rmCircleEvent(e.arcsNodes[0]),this.rmCircleEvent(e.arcsNodes[2]),this.addCircleEvent(e.arcsNodes[0],e.coord[1]),this.addCircleEvent(e.arcsNodes[2],e.coord[1])},Fortune.prototype.getPoints=function(){return this.sites},Fortune.prototype.getEdges=function(){for(this.beach.item=this.events.splice(0,1)[0].coord,this.iterations+=1;this.events.length>0;)this.events[0].arcsNodes?this.manageCircleEvent():this.manageSiteEvent(),this.iterations+=1;return this.edges},Fortune.prototype.getPatches=function(e,t,i,r,s){function n(e,t){for(var i=0;i<t.length;i++)if(t[i][0]===e[0]&&t[i][1]===e[1])return!0;return!1}function o(e,t,i){for(var r=0;r<i.length;r++)if(Math.atan2(t[1]-e[1],t[0]-e[0])<Math.atan2(i[r][1]-e[1],i[r][0]-e[0]))return void i.splice(r,0,t);i.push(t)}function a(e){n(e.ps,this.patches[e.pl])||o(e.pl,e.ps,this.patches[e.pl]),n(e.ps,this.patches[e.pr])||o(e.pr,e.ps,this.patches[e.pr]),n(e.pe,this.patches[e.pl])||o(e.pl,e.pe,this.patches[e.pl]),n(e.pe,this.patches[e.pr])||o(e.pr,e.pe,this.patches[e.pr])}return this.getEdges().forEach(a,this),this.patches},exports["default"]=Fortune,module.exports=exports["default"];
},{"./beachline":4,"./event":9,"./geom":11}],11:[function(require,module,exports){
"use strict";Object.defineProperty(exports,"__esModule",{value:!0});var _slicedToArray=function(){function r(r,t){var e=[],n=!0,o=!1,i=void 0;try{for(var s,a=r[Symbol.iterator]();!(n=(s=a.next()).done)&&(e.push(s.value),!t||e.length!==t);n=!0);}catch(u){o=!0,i=u}finally{try{!n&&a["return"]&&a["return"]()}finally{if(o)throw i}}return e}return function(t,e){if(Array.isArray(t))return t;if(Symbol.iterator in Object(t))return r(t,e);throw new TypeError("Invalid attempt to destructure non-iterable instance")}}(),sq=function(r){return r*r},distPointToPoint=function(r,t){var e=_slicedToArray(r,2),n=e[0],o=e[1],i=_slicedToArray(t,2),s=i[0],a=i[1];return Math.sqrt(sq(n-s)+sq(o-a))},distPointToParabol=function(r,t){var e=distPointToPoint(r,t);return 0==e?1/0:sq(e)/(2*Math.abs(r[1]-t[1]))},circumCenter=function(r,t,e){var n=(r[0]-e[0])*(t[1]-e[1])-(t[0]-e[0])*(r[1]-e[1]);if(0==n)return[1/0,1/0];var o=(((r[0]-e[0])*(r[0]+e[0])+(r[1]-e[1])*(r[1]+e[1]))/2*(t[1]-e[1])-((t[0]-e[0])*(t[0]+e[0])+(t[1]-e[1])*(t[1]+e[1]))/2*(r[1]-e[1]))/n,i=(((t[0]-e[0])*(t[0]+e[0])+(t[1]-e[1])*(t[1]+e[1]))/2*(r[0]-e[0])-((r[0]-e[0])*(r[0]+e[0])+(r[1]-e[1])*(r[1]+e[1]))/2*(t[0]-e[0]))/n;return[o,i]},parabolsCrossX=function(r,t,e){if(r[1]===t[1])return[(r[0]+t[0])/2,(r[0]+t[0])/2];var n=(r[1]*t[0]-r[0]*t[1]+r[0]*e-t[0]*e+Math.sqrt((r[0]*r[0]+r[1]*r[1]-2*r[0]*t[0]+t[0]*t[0]-2*r[1]*t[1]+t[1]*t[1])*(r[1]*t[1]-r[1]*e-t[1]*e+e*e)))/(r[1]-t[1]),o=(r[1]*t[0]-r[0]*t[1]+r[0]*e-t[0]*e-Math.sqrt((r[0]*r[0]+r[1]*r[1]-2*r[0]*t[0]+t[0]*t[0]-2*r[1]*t[1]+t[1]*t[1])*(r[1]*t[1]-r[1]*e-t[1]*e+e*e)))/(r[1]-t[1]);return o>n?[n,o]:[o,n]},doHalflinesCross=function(r,t){var e=arguments.length<=2||void 0===arguments[2]?1e-10:arguments[2],n=t.ps[0]-r.ps[0],o=t.ps[1]-r.ps[1];if(r.m==1/0)return r.hp*(t.m*n-o)<=e&&t.vec[0]*n<=e;if(t.m==1/0)return t.hp*(r.m*n-o)>=-e&&r.vec[0]*n>=-e;var i=t.vec[0]*r.vec[1]-t.vec[1]*r.vec[0];if(0===i)return!1;var s=(o*t.vec[0]-n*t.vec[1])/i,a=(o*r.vec[0]-n*r.vec[1])/i;return s>=-e&&a>=e||s>=e&&a>=-e};exports["default"]={distPointToPoint:distPointToPoint,distPointToParabol:distPointToParabol,circumCenter:circumCenter,parabolsCrossX:parabolsCrossX,doHalflinesCross:doHalflinesCross},module.exports=exports["default"];
},{}],12:[function(require,module,exports){
"use strict";function _interopRequireDefault(r){return r&&r.__esModule?r:{"default":r}}Object.defineProperty(exports,"__esModule",{value:!0});var _slicedToArray=function(){function r(r,t){var e=[],n=!0,o=!1,a=void 0;try{for(var i,u=r[Symbol.iterator]();!(n=(i=u.next()).done)&&(e.push(i.value),!t||e.length!==t);n=!0);}catch(l){o=!0,a=l}finally{try{!n&&u["return"]&&u["return"]()}finally{if(o)throw a}}return e}return function(t,e){if(Array.isArray(t))return t;if(Symbol.iterator in Object(t))return r(t,e);throw new TypeError("Invalid attempt to destructure non-iterable instance")}}(),_polygon=require("./polygon"),_polygon2=_interopRequireDefault(_polygon),_ops=require("./ops"),_barnesHut=require("./barnes-hut"),_barnesHut2=_interopRequireDefault(_barnesHut),randomPosition=function(r,t){return[Math.random()*r,Math.random()*t]},cap=function(r,t){return Math.min(Math.max(t,0),r)},inside=function(r,t){return function(e){var n=_slicedToArray(e,2),o=n[0],a=n[1];return[cap(r,o),cap(t,a)]}},attractiveForces=function(r,t,e){var n={},o=!0,a=!1,i=void 0;try{for(var u,l=Object.keys(r)[Symbol.iterator]();!(o=(u=l.next()).done);o=!0){var s=u.value,c=r[s],f=c.start,d=c.end,y=c.weight,v=t[f],p=t[d],_=(0,_ops.times)(e*y,(0,_ops.minus)(v,p));n[f]||(n[f]=[0,0]),n[d]||(n[d]=[0,0]),n[f]=(0,_ops.minus)(n[f],_),n[d]=(0,_ops.plus)(n[d],_)}}catch(h){a=!0,i=h}finally{try{!o&&l["return"]&&l["return"]()}finally{if(a)throw i}}return n};exports["default"]=function(r){var t=r.data,e=r.nodeaccessor,n=r.linkaccessor,o=r.width,a=r.height,i=r.attraction,u=r.repulsion,l=r.threshold,s=function(r){return r};e||(e=s),n||(n=s),i=i||1,u=u||1,l=l||.5;var c=inside(o,a),f=t.nodes,d=t.links,y=t.constraints;y||(y={});var v={},p={},_=!0,h=!1,b=void 0;try{for(var m,w=f[Symbol.iterator]();!(_=(m=w.next()).done);_=!0){var x=m.value,g=e(x);v[g]=y[g]||randomPosition(o,a),p[g]=x}}catch(k){h=!0,b=k}finally{try{!_&&w["return"]&&w["return"]()}finally{if(h)throw b}}var H={},j=!0,q=!1,M=void 0;try{for(var O,S=d[Symbol.iterator]();!(j=(O=S.next()).done);j=!0){var A=O.value,D=n(A),P=D.start,R=D.end,T=D.weight;H[P+"|"+R]={weight:T,start:P,end:R,link:A}}}catch(k){q=!0,M=k}finally{try{!j&&S["return"]&&S["return"]()}finally{if(q)throw M}}var F=function(){var r=_barnesHut2["default"].bodies(v),t=_barnesHut2["default"].root(o,a),e=_barnesHut2["default"].tree(r,t),n=attractiveForces(H,v,i/1e3),s=_barnesHut2["default"].forces(e,1e3*u,l),f=!0,d=!1,p=void 0;try{for(var _,h=Object.keys(v)[Symbol.iterator]();!(f=(_=h.next()).done);f=!0){var b=_.value,m=v[b];if(y[b])v[b]=y[b];else{var w=n[b]||[0,0],x=s[b]||[0,0],g=(0,_ops.plus)(w,x);v[b]=c((0,_ops.plus)(m,g))}}}catch(k){d=!0,p=k}finally{try{!f&&h["return"]&&h["return"]()}finally{if(d)throw p}}return B()},E=function(r,t){y[r]=t},I=function(r){delete y[r]},z={tick:F,constrain:E,unconstrain:I},B=function(){var r=-1;return z.curves=(0,_ops.mapObject)(H,function(t,e){var n=e.start,o=e.end,a=e.link;r+=1;var i=v[n],u=v[o];return{link:(0,_polygon2["default"])({points:[i,u],closed:!1}),item:a,index:r}}),z.nodes=(0,_ops.mapObject)(p,function(r,t){return{point:v[r],item:t}}),z};return B()},module.exports=exports["default"];
},{"./barnes-hut":3,"./ops":15,"./polygon":18}],13:[function(require,module,exports){
"use strict";function _interopRequireDefault(r){return r&&r.__esModule?r:{"default":r}}Object.defineProperty(exports,"__esModule",{value:!0});var _slicedToArray=function(){function r(r,n){var e=[],t=!0,a=!1,i=void 0;try{for(var o,u=r[Symbol.iterator]();!(t=(o=u.next()).done)&&(e.push(o.value),!n||e.length!==n);t=!0);}catch(l){a=!0,i=l}finally{try{!t&&u["return"]&&u["return"]()}finally{if(a)throw i}}return e}return function(n,e){if(Array.isArray(n))return n;if(Symbol.iterator in Object(n))return r(n,e);throw new TypeError("Invalid attempt to destructure non-iterable instance")}}(),_linear=require("./linear"),_linear2=_interopRequireDefault(_linear),_ops=require("./ops"),epsilon=1e-5,box=function(r,n){var e=r.map(n),t=e.sort(function(r,n){var e=_slicedToArray(r,2),t=e[0],a=(e[1],_slicedToArray(n,2)),i=a[0];a[1];return t-i}),a=t.length,i=t[0][0],o=t[a-1][0],u=(0,_ops.minBy)(t,function(r){return r[1]}),l=(0,_ops.maxBy)(t,function(r){return r[1]});return i==o&&(o+=epsilon),u==l&&(l+=epsilon),{points:t,xmin:i,xmax:o,ymin:u,ymax:l}};exports["default"]=function(r){var n=r.data,e=r.xaccessor,t=r.yaccessor,a=r.width,i=r.height,o=r.closed,u=r.min,l=r.max;e||(e=function(r){var n=_slicedToArray(r,2),e=n[0];n[1];return e}),t||(t=function(r){var n=_slicedToArray(r,2),e=(n[0],n[1]);return e});var s=function(r){return[e(r),t(r)]},c=n.map(function(r){return box(r,s)}),f=(0,_ops.minBy)(c,function(r){return r.xmin}),y=(0,_ops.maxBy)(c,function(r){return r.xmax}),m=null==u?(0,_ops.minBy)(c,function(r){return r.ymin}):u,p=null==l?(0,_ops.maxBy)(c,function(r){return r.ymax}):l;o&&(m=Math.min(m,0),p=Math.max(p,0));var _=o?0:m,d=(0,_linear2["default"])([f,y],[0,a]),x=(0,_linear2["default"])([m,p],[i,0]),v=function(r){var n=_slicedToArray(r,2),e=n[0],t=n[1];return[d(e),x(t)]};return{arranged:c,scale:v,xscale:d,yscale:x,base:_}},module.exports=exports["default"];
},{"./linear":14,"./ops":15}],14:[function(require,module,exports){
"use strict";Object.defineProperty(exports,"__esModule",{value:!0});var _slicedToArray=function(){function r(r,e){var t=[],n=!0,o=!1,i=void 0;try{for(var u,a=r[Symbol.iterator]();!(n=(u=a.next()).done)&&(t.push(u.value),!e||t.length!==e);n=!0);}catch(l){o=!0,i=l}finally{try{!n&&a["return"]&&a["return"]()}finally{if(o)throw i}}return t}return function(e,t){if(Array.isArray(e))return e;if(Symbol.iterator in Object(e))return r(e,t);throw new TypeError("Invalid attempt to destructure non-iterable instance")}}(),linear=function r(e,t){var n=_slicedToArray(e,2),o=n[0],i=n[1],u=_slicedToArray(t,2),a=u[0],l=u[1],c=function(r){return a+(l-a)*(r-o)/(i-o)};return c.inverse=function(){return r([a,l],[o,i])},c};exports["default"]=linear,module.exports=exports["default"];
},{}],15:[function(require,module,exports){
"use strict";Object.defineProperty(exports,"__esModule",{value:!0});var _slicedToArray=function(){function r(r,e){var n=[],t=!0,u=!1,i=void 0;try{for(var a,o=r[Symbol.iterator]();!(t=(a=o.next()).done)&&(n.push(a.value),!e||n.length!==e);t=!0);}catch(s){u=!0,i=s}finally{try{!t&&o["return"]&&o["return"]()}finally{if(u)throw i}}return n}return function(e,n){if(Array.isArray(e))return e;if(Symbol.iterator in Object(e))return r(e,n);throw new TypeError("Invalid attempt to destructure non-iterable instance")}}(),sum=function(r){return r.reduce(function(r,e){return r+e},0)},min=function(r){return r.reduce(function(r,e){return Math.min(r,e)})},max=function(r){return r.reduce(function(r,e){return Math.max(r,e)})},sumBy=function(r,e){return r.reduce(function(r,n){return r+e(n)},0)},minBy=function(r,e){return r.reduce(function(r,n){return Math.min(r,e(n))},1/0)},maxBy=function(r,e){return r.reduce(function(r,n){return Math.max(r,e(n))},-(1/0))},plus=function(r,e){var n=_slicedToArray(r,2),t=n[0],u=n[1],i=_slicedToArray(e,2),a=i[0],o=i[1];return[t+a,u+o]},minus=function(r,e){var n=_slicedToArray(r,2),t=n[0],u=n[1],i=_slicedToArray(e,2),a=i[0],o=i[1];return[t-a,u-o]},times=function(r,e){var n=_slicedToArray(e,2),t=n[0],u=n[1];return[r*t,r*u]},length=function(r){var e=_slicedToArray(r,2),n=e[0],t=e[1];return Math.sqrt(n*n+t*t)},sumVectors=function(r){return r.reduce(plus,[0,0])},average=function(r){return times(1/r.length,r.reduce(plus))},onCircle=function(r,e){return times(r,[Math.sin(e),-Math.cos(e)])},enhance=function(r,e){var n=r||{};for(var t in n){var u=n[t];e[t]=u(e.index,e.item,e.group)}return e},range=function(r,e,n){for(var t=[],u=r;e>u;u++)t.push(u);return n&&t.push(e),t},mapObject=function(r,e){var n=[],t=!0,u=!1,i=void 0;try{for(var a,o=Object.keys(r)[Symbol.iterator]();!(t=(a=o.next()).done);t=!0){var s=a.value,c=r[s];n.push(e(s,c))}}catch(m){u=!0,i=m}finally{try{!t&&o["return"]&&o["return"]()}finally{if(u)throw i}}return n},pairs=function(r){return mapObject(r,function(r,e){return[r,e]})},id=function(r){return r};exports.sum=sum,exports.min=min,exports.max=max,exports.sumBy=sumBy,exports.minBy=minBy,exports.maxBy=maxBy,exports.plus=plus,exports.minus=minus,exports.times=times,exports.id=id,exports.length=length,exports.sumVectors=sumVectors,exports.average=average,exports.onCircle=onCircle,exports.enhance=enhance,exports.range=range,exports.mapObject=mapObject,exports.pairs=pairs,exports["default"]={sum:sum,min:min,max:max,sumBy:sumBy,minBy:minBy,maxBy:maxBy,plus:plus,minus:minus,times:times,id:id,length:length,sumVectors:sumVectors,average:average,onCircle:onCircle,enhance:enhance,range:range,mapObject:mapObject,pairs:pairs};
},{}],16:[function(require,module,exports){
"use strict";Object.defineProperty(exports,"__esModule",{value:!0});var _slicedToArray=function(){function r(r,n){var t=[],e=!0,a=!1,o=void 0;try{for(var u,c=r[Symbol.iterator]();!(e=(u=c.next()).done)&&(t.push(u.value),!n||t.length!==n);e=!0);}catch(i){a=!0,o=i}finally{try{!e&&c["return"]&&c["return"]()}finally{if(a)throw o}}return t}return function(n,t){if(Array.isArray(n))return n;if(Symbol.iterator in Object(n))return r(n,t);throw new TypeError("Invalid attempt to destructure non-iterable instance")}}(),Path=function r(n){var t=n||[],e=function(r,n){var t=r.slice(0,r.length);return t.push(n),t},a=function(r,n){var t=_slicedToArray(r,2),e=t[0],a=t[1],o=_slicedToArray(n,2),u=o[0],c=o[1];return e===u&&a===c},o=function(r,n){for(var t=r.length;"0"===r.charAt(t-1);)t-=1;return"."===r.charAt(t-1)&&(t-=1),r.substr(0,t)},u=function(r,n){var t=r.toFixed(n);return o(t)},c=function(r){var n=r.command,t=r.params,e=t.map(function(r){return u(r,6)});return n+" "+e.join(" ")},i=function(r,n){var t=r.command,e=r.params,a=_slicedToArray(n,2),o=a[0],u=a[1];switch(t){case"M":return[e[0],e[1]];case"L":return[e[0],e[1]];case"H":return[e[0],u];case"V":return[o,e[0]];case"Z":return null;case"C":return[e[4],e[5]];case"S":return[e[2],e[3]];case"Q":return[e[2],e[3]];case"T":return[e[0],e[1]];case"A":return[e[5],e[6]]}},s=function(r,n){return function(t){var e="object"==typeof t?r.map(function(r){return t[r]}):arguments;return n.apply(null,e)}},m=function(n){return r(e(t,n))};return{moveto:s(["x","y"],function(r,n){return m({command:"M",params:[r,n]})}),lineto:s(["x","y"],function(r,n){return m({command:"L",params:[r,n]})}),hlineto:s(["x"],function(r){return m({command:"H",params:[r]})}),vlineto:s(["y"],function(r){return m({command:"V",params:[r]})}),closepath:function(){return m({command:"Z",params:[]})},curveto:s(["x1","y1","x2","y2","x","y"],function(r,n,t,e,a,o){return m({command:"C",params:[r,n,t,e,a,o]})}),smoothcurveto:s(["x2","y2","x","y"],function(r,n,t,e){return m({command:"S",params:[r,n,t,e]})}),qcurveto:s(["x1","y1","x","y"],function(r,n,t,e){return m({command:"Q",params:[r,n,t,e]})}),smoothqcurveto:s(["x","y"],function(r,n){return m({command:"T",params:[r,n]})}),arc:s(["rx","ry","xrot","largeArcFlag","sweepFlag","x","y"],function(r,n,t,e,a,o,u){return m({command:"A",params:[r,n,t,e,a,o,u]})}),print:function(){return t.map(c).join(" ")},points:function(){var r=[],n=[0,0],e=!0,a=!1,o=void 0;try{for(var u,c=t[Symbol.iterator]();!(e=(u=c.next()).done);e=!0){var s=u.value,m=i(s,n);n=m,m&&r.push(m)}}catch(f){a=!0,o=f}finally{try{!e&&c["return"]&&c["return"]()}finally{if(a)throw o}}return r},instructions:function(){return t.slice(0,t.length)},connect:function(n){var t=this.points(),e=t[t.length-1],o=n.points()[0],u=n.instructions().slice(1);return a(e,o)||u.unshift({command:"L",params:o}),r(this.instructions().concat(u))}}};exports["default"]=function(){return Path()},module.exports=exports["default"];
},{}],17:[function(require,module,exports){
"use strict";function _interopRequireDefault(e){return e&&e.__esModule?e:{"default":e}}Object.defineProperty(exports,"__esModule",{value:!0});var _slicedToArray=function(){function e(e,r){var t=[],n=!0,o=!1,a=void 0;try{for(var i,u=e[Symbol.iterator]();!(n=(i=u.next()).done)&&(t.push(i.value),!r||t.length!==r);n=!0);}catch(l){o=!0,a=l}finally{try{!n&&u["return"]&&u["return"]()}finally{if(o)throw a}}return t}return function(r,t){if(Array.isArray(r))return r;if(Symbol.iterator in Object(r))return e(r,t);throw new TypeError("Invalid attempt to destructure non-iterable instance")}}(),_linear=require("./linear"),_linear2=_interopRequireDefault(_linear),_sector=require("./sector"),_sector2=_interopRequireDefault(_sector),_ops=require("./ops");exports["default"]=function(e){var r=e.data,t=e.accessor,n=e.center,o=e.r,a=e.R,i=e.compute,u=r.map(t),l=(0,_ops.sum)(u),s=(0,_linear2["default"])([0,l],[0,2*Math.PI]),c=[],f=0,d=!0,_=!1,p=void 0;try{for(var y,v=r.entries()[Symbol.iterator]();!(d=(y=v.next()).done);d=!0){var h=_slicedToArray(y.value,2),m=h[0],x=h[1],b=u[m];c.push((0,_ops.enhance)(i,{item:x,index:m,sector:(0,_sector2["default"])({center:n,r:o,R:a,start:s(f),end:s(f+b)})})),f+=b}}catch(q){_=!0,p=q}finally{try{!d&&v["return"]&&v["return"]()}finally{if(_)throw p}}return{curves:c}},module.exports=exports["default"];
},{"./linear":14,"./ops":15,"./sector":22}],18:[function(require,module,exports){
"use strict";function _interopRequireDefault(e){return e&&e.__esModule?e:{"default":e}}function _toConsumableArray(e){if(Array.isArray(e)){for(var r=0,t=Array(e.length);r<e.length;r++)t[r]=e[r];return t}return Array.from(e)}Object.defineProperty(exports,"__esModule",{value:!0});var _path=require("./path"),_path2=_interopRequireDefault(_path),_ops=require("./ops");exports["default"]=function(e){var r,t=e.points,o=e.closed,a=t.length,u=t[0],n=t.slice(1,a+1),l=n.reduce(function(e,r){return e.lineto.apply(e,_toConsumableArray(r))},(r=(0,_path2["default"])()).moveto.apply(r,_toConsumableArray(u)));return{path:o?l.closepath():l,centroid:(0,_ops.average)(t)}},module.exports=exports["default"];
},{"./ops":15,"./path":16}],19:[function(require,module,exports){
"use strict";function _interopRequireDefault(e){return e&&e.__esModule?e:{"default":e}}Object.defineProperty(exports,"__esModule",{value:!0});var _semiRegularPolygon=require("./semi-regular-polygon"),_semiRegularPolygon2=_interopRequireDefault(_semiRegularPolygon),_ops=require("./ops"),collectKeys=function(e){var r=[],t=(e.map(Object.keys),!0),n=!1,o=void 0;try{for(var a,u=e[Symbol.iterator]();!(t=(a=u.next()).done);t=!0){var i=a.value,l=!0,c=!1,s=void 0;try{for(var f,y=Object.keys(i)[Symbol.iterator]();!(l=(f=y.next()).done);l=!0){var p=f.value;-1==r.indexOf(p)&&r.push(p)}}catch(v){c=!0,s=v}finally{try{!l&&y["return"]&&y["return"]()}finally{if(c)throw s}}}}catch(v){n=!0,o=v}finally{try{!t&&u["return"]&&u["return"]()}finally{if(n)throw o}}return r},keyAccessor=function(e){var r={},t=!0,n=!1,o=void 0;try{for(var a,u=e[Symbol.iterator]();!(t=(a=u.next()).done);t=!0){var i=a.value;!function(e){r[e]=function(r){return r[e]}}(i)}}catch(l){n=!0,o=l}finally{try{!t&&u["return"]&&u["return"]()}finally{if(n)throw o}}return r},globalMax=function(e,r){var t=Object.keys(r),n=e.map(function(e){return(0,_ops.maxBy)(t,function(t){return r[t](e)})});return(0,_ops.max)(n)};exports["default"]=function(e){var r=e.data,t=e.accessor,n=e.center,o=e.r,a=e.max,u=e.rings,i=void 0===u?3:u,l=e.compute,c=void 0===l?{}:l;t||(t=keyAccessor(collectKeys(r)));var s=Object.keys(t),f=s.length,y=(2*Math.PI/f,-1);null==a&&(a=globalMax(r,t));var p=(0,_ops.range)(1,i,!0).map(function(e){var r=o*e/i;return(0,_semiRegularPolygon2["default"])({center:n,radii:(0,_ops.range)(0,f).map(function(e){return r})})}),v=r.map(function(e){return y+=1,(0,_ops.enhance)(c,{polygon:(0,_semiRegularPolygon2["default"])({center:n,radii:s.map(function(r){return o*t[r](e)/a})}),item:e,index:y})});return{curves:v,rings:p}},module.exports=exports["default"];
},{"./ops":15,"./semi-regular-polygon":24}],20:[function(require,module,exports){
"use strict";function _interopRequireDefault(e){return e&&e.__esModule?e:{"default":e}}Object.defineProperty(exports,"__esModule",{value:!0});var _polygon=require("./polygon"),_polygon2=_interopRequireDefault(_polygon);exports["default"]=function(e){var o=e.left,t=e.right,r=e.top,u=e.bottom;return(0,_polygon2["default"])({points:[[t,r],[t,u],[o,u],[o,r]],closed:!0})},module.exports=exports["default"];
},{"./polygon":18}],21:[function(require,module,exports){
"use strict";function _interopRequireDefault(e){return e&&e.__esModule?e:{"default":e}}Object.defineProperty(exports,"__esModule",{value:!0});var _slicedToArray=function(){function e(e,r){var t=[],n=!0,u=!1,o=void 0;try{for(var a,c=e[Symbol.iterator]();!(n=(a=c.next()).done)&&(t.push(a.value),!r||t.length!==r);n=!0);}catch(i){u=!0,o=i}finally{try{!n&&c["return"]&&c["return"]()}finally{if(u)throw o}}return t}return function(r,t){if(Array.isArray(r))return r;if(Symbol.iterator in Object(r))return e(r,t);throw new TypeError("Invalid attempt to destructure non-iterable instance")}}(),_rectangle=require("./rectangle"),_rectangle2=_interopRequireDefault(_rectangle),_curvedRectangle=require("./curved-rectangle"),_curvedRectangle2=_interopRequireDefault(_curvedRectangle),_ops=require("./ops");exports["default"]=function(e){var r=e.data,t=e.nodeaccessor,n=e.linkaccessor,u=e.width,o=e.height,a=e.gutter,c=e.rectWidth,i=e.compute,l=function(e){return e};t||(t=l),n||(n=l),a=a||10,c=c||10;var s=r.links.map(n),f=r.nodes.map(function(e){return e.map(t)}),d=(u-c)/(r.nodes.length-1),p={};f.reduce(function(e,r){return e.concat(r)}).forEach(function(e){p[e]={value:0,currentlyUsedIn:0,currentlyUsedOut:0}});var v=!0,y=!1,h=void 0;try{for(var g,_=function(){var e=_slicedToArray(g.value,2),r=e[0],t=e[1],n=(0,_ops.sumBy)(s.filter(function(e){return e.end===r}),function(e){return e.weight}),u=(0,_ops.sumBy)(s.filter(function(e){return e.start===r}),function(e){return e.weight});t.value=Math.max(n,u)},m=(0,_ops.pairs)(p)[Symbol.iterator]();!(v=(g=m.next()).done);v=!0)_()}catch(b){y=!0,h=b}finally{try{!v&&m["return"]&&m["return"]()}finally{if(y)throw h}}var x=f.map(function(e){return(0,_ops.sumBy)(e,function(e){return p[e].value})}),w=f.map(function(e){return o-(e.length-1)*a}),R=(0,_ops.min)(x.map(function(e,r){return w[r]/e})),q=!0,U=!1,A=void 0;try{for(var O,B=(0,_ops.pairs)(p)[Symbol.iterator]();!(q=(O=B.next()).done);q=!0){var E=_slicedToArray(O.value,2),I=(E[0],E[1]);I.scaledValue=R*I.value}}catch(b){U=!0,A=b}finally{try{!q&&B["return"]&&B["return"]()}finally{if(U)throw A}}var S=[],T=-1;f.forEach(function(e,t){var n=(0,_ops.sumBy)(e,function(e){return p[e].scaledValue})+(e.length-1)*a,u=(o-n)/2,l=u-a;e.forEach(function(e,n){var u=l+a,o=u+p[e].scaledValue;l=o;var s={top:u,bottom:o,left:c/2+t*d-c/2,right:c/2+t*d+c/2};p[e].rectangleCoords=s,T+=1,S.push((0,_ops.enhance)(i,{curve:(0,_rectangle2["default"])(s),item:r.nodes[t][n],index:T,group:t}))})});var k=s.map(function(e,t){var n=p[e.start],u=p[e.end],o=n.rectangleCoords,a=u.rectangleCoords,c=e.weight*R,l=o.top+n.currentlyUsedOut,s=a.top+u.currentlyUsedIn,f={topleft:[o.right,l],topright:[a.left,s],bottomleft:[o.right,l+c],bottomright:[a.left,s+c]};return n.currentlyUsedOut+=c,u.currentlyUsedIn+=c,(0,_ops.enhance)(i,{curve:(0,_curvedRectangle2["default"])(f),item:r.links[t],index:t})});return{curvedRectangles:k,rectangles:S}},module.exports=exports["default"];
},{"./curved-rectangle":8,"./ops":15,"./rectangle":20}],22:[function(require,module,exports){
"use strict";function _interopRequireDefault(r){return r&&r.__esModule?r:{"default":r}}function _toConsumableArray(r){if(Array.isArray(r)){for(var e=0,o=Array(r.length);e<r.length;e++)o[e]=r[e];return o}return Array.from(r)}Object.defineProperty(exports,"__esModule",{value:!0});var _path=require("./path"),_path2=_interopRequireDefault(_path),_ops=require("./ops");exports["default"]=function(r){var e,o,t,a,p=r.center,l=r.r,s=r.R,u=r.start,n=r.end,_=(0,_ops.plus)(p,(0,_ops.onCircle)(s,u)),i=(0,_ops.plus)(p,(0,_ops.onCircle)(s,n)),c=(0,_ops.plus)(p,(0,_ops.onCircle)(l,n)),y=(0,_ops.plus)(p,(0,_ops.onCircle)(l,u)),f=n-u>Math.PI?1:0,d=(e=(o=(t=(a=(0,_path2["default"])()).moveto.apply(a,_toConsumableArray(_))).arc.apply(t,[s,s,0,f,1].concat(_toConsumableArray(i)))).lineto.apply(o,_toConsumableArray(c))).arc.apply(e,[l,l,0,f,0].concat(_toConsumableArray(y))).closepath(),h=(u+n)/2,C=(l+s)/2,A=(0,_ops.plus)(p,(0,_ops.onCircle)(C,h));return{path:d,centroid:A}},module.exports=exports["default"];
},{"./ops":15,"./path":16}],23:[function(require,module,exports){
"use strict";function Segment(t,s,h,i){this.pl=t,this.pr=s,this.ps=h,this.pe=i,this.m=this.pl[1]===this.pr[1]?1/0:-(this.pl[0]-this.pr[0])/(this.pl[1]-this.pr[1]),this.hp=this.pl[0]<this.pr[0]||this.pl[0]===this.pr[0]&&this.pl[1]>this.pr[1]?1:-1,this.vec=this.hp*this.m>0||0===this.m&&this.hp>0?[1,this.m]:[-1,-this.m]}Object.defineProperty(exports,"__esModule",{value:!0}),exports["default"]=Segment,module.exports=exports["default"];
},{}],24:[function(require,module,exports){
"use strict";function _interopRequireDefault(e){return e&&e.__esModule?e:{"default":e}}Object.defineProperty(exports,"__esModule",{value:!0});var _polygon=require("./polygon"),_polygon2=_interopRequireDefault(_polygon),_ops=require("./ops");exports["default"]=function(e){var o=e.center,r=e.radii,t=2*Math.PI/r.length,u=r.map(function(e,r){return(0,_ops.plus)(o,(0,_ops.onCircle)(e,r*t))});return(0,_polygon2["default"])({points:u,closed:!0})},module.exports=exports["default"];
},{"./ops":15,"./polygon":18}],25:[function(require,module,exports){
"use strict";function _interopRequireDefault(e){return e&&e.__esModule?e:{"default":e}}function _toConsumableArray(e){if(Array.isArray(e)){for(var r=0,a=Array(e.length);r<e.length;r++)a[r]=e[r];return a}return Array.from(e)}Object.defineProperty(exports,"__esModule",{value:!0});var _bezier=require("./bezier"),_bezier2=_interopRequireDefault(_bezier),_lineChartComp=require("./line-chart-comp"),_lineChartComp2=_interopRequireDefault(_lineChartComp),_ops=require("./ops");exports["default"]=function(e){var r=(0,_lineChartComp2["default"])(e),a=r.arranged,t=r.scale,o=r.xscale,n=r.yscale,i=r.base,l=-1,u=a.map(function(r){var a,o,n=r.points,u=r.xmin,p=r.xmax,s=n.map(t);l+=1;var _=(0,_bezier2["default"])({points:s}),c={path:(a=(o=_.path).lineto.apply(o,_toConsumableArray(t([p,i])))).lineto.apply(a,_toConsumableArray(t([u,i]))).closepath(),centroid:(0,_ops.average)([_.centroid,t([u,i]),t([p,i])])};return(0,_ops.enhance)(e.compute,{item:e.data[l],line:_,area:c,index:l})});return{curves:u,xscale:o,yscale:n}},module.exports=exports["default"];
},{"./bezier":5,"./line-chart-comp":13,"./ops":15}],26:[function(require,module,exports){
"use strict";function _interopRequireDefault(r){return r&&r.__esModule?r:{"default":r}}Object.defineProperty(exports,"__esModule",{value:!0});var _slicedToArray=function(){function r(r,e){var t=[],n=!0,a=!1,i=void 0;try{for(var l,o=r[Symbol.iterator]();!(n=(l=o.next()).done)&&(t.push(l.value),!e||t.length!==e);n=!0);}catch(u){a=!0,i=u}finally{try{!n&&o["return"]&&o["return"]()}finally{if(a)throw i}}return t}return function(e,t){if(Array.isArray(e))return e;if(Symbol.iterator in Object(e))return r(e,t);throw new TypeError("Invalid attempt to destructure non-iterable instance")}}(),_linear=require("./linear"),_linear2=_interopRequireDefault(_linear),_rectangle=require("./rectangle"),_rectangle2=_interopRequireDefault(_rectangle),_ops=require("./ops");exports["default"]=function(r){var e=r.data,t=r.accessor,n=void 0===t?_ops.id:t,a=r.width,i=r.height,l=r.min,o=r.max,u=r.gutter,f=void 0===u?10:u,c=r.compute,y=[],d=!1,s=!1;null==l&&(l=0,d=!0),null==o&&(o=0,s=!0);var v=!0,_=!1,h=void 0;try{for(var p,m=e.entries()[Symbol.iterator]();!(v=(p=m.next()).done);v=!0){var g=_slicedToArray(p.value,2),x=g[0],b=g[1],w=!0,A=!1,q=void 0;try{for(var S,T=b.entries()[Symbol.iterator]();!(w=(S=T.next()).done);w=!0){var D=_slicedToArray(S.value,2),R=D[0],j=D[1];null==y[R]&&(y[R]=[]);var M=0===x?0:y[R][x-1],O=n(j)+M;d&&l>O&&(l=O),s&&O>o&&(o=O),y[R][x]=O}}catch(E){A=!0,q=E}finally{try{!w&&T["return"]&&T["return"]()}finally{if(A)throw q}}}}catch(E){_=!0,h=E}finally{try{!v&&m["return"]&&m["return"]()}finally{if(_)throw h}}var I=e[0].length,P=(0,_linear2["default"])([l,o],[i,0]),k=(a-(I-1)*f)/I,z=[],B=!0,C=!1,F=void 0;try{for(var G,H=e.entries()[Symbol.iterator]();!(B=(G=H.next()).done);B=!0){var J=_slicedToArray(G.value,2),x=J[0],b=J[1],K=!0,L=!1,N=void 0;try{for(var Q,U=b.entries()[Symbol.iterator]();!(K=(Q=U.next()).done);K=!0){var V=_slicedToArray(Q.value,2),R=V[0],j=V[1],W={line:(0,_rectangle2["default"])({top:P(y[R][x]),bottom:P(0===x?0:y[R][x-1]),left:R*(k+f),right:R*(k+f)+k}),index:R,group:x,item:j};z.push((0,_ops.enhance)(c,W))}}catch(E){L=!0,N=E}finally{try{!K&&U["return"]&&U["return"]()}finally{if(L)throw N}}}}catch(E){C=!0,F=E}finally{try{!B&&H["return"]&&H["return"]()}finally{if(C)throw F}}return{curves:z,scale:P}},module.exports=exports["default"];
},{"./linear":14,"./ops":15,"./rectangle":20}],27:[function(require,module,exports){
"use strict";function _interopRequireDefault(e){return e&&e.__esModule?e:{"default":e}}Object.defineProperty(exports,"__esModule",{value:!0});var _polygon=require("./polygon"),_polygon2=_interopRequireDefault(_polygon),_lineChartComp=require("./line-chart-comp"),_lineChartComp2=_interopRequireDefault(_lineChartComp),_ops=require("./ops");exports["default"]=function(e){var o=(0,_lineChartComp2["default"])(e),r=o.arranged,t=o.scale,a=o.xscale,n=o.yscale,l=o.base,p=-1,u=r.map(function(o){var r=o.points,a=o.xmin,n=o.xmax,u=r.map(t);r.push([n,l]),r.push([a,l]);var i=r.map(t);return p+=1,(0,_ops.enhance)(e.compute,{item:e.data[p],line:(0,_polygon2["default"])({points:u,closed:!1}),area:(0,_polygon2["default"])({points:i,closed:!0}),index:p})});return{curves:u,xscale:a,yscale:n}},module.exports=exports["default"];
},{"./line-chart-comp":13,"./ops":15,"./polygon":18}],28:[function(require,module,exports){
"use strict";Object.defineProperty(exports,"__esModule",{value:!0});var maxBy=function(e,t){return void 0===e&&(e=[]),e.reduce(function(e,r){return Math.max(e,t(r))},0)},treeHeight=function e(t){return 1+maxBy(t.children,e)},buildTree=function t(e,r){var n=arguments.length<=2||void 0===arguments[2]?0:arguments[2],i={item:e,level:n},u=r(e);return u&&u.length&&(i.children=u.map(function(e){return t(e,r,n+1)})),i},setHeight=function r(e){var t=arguments.length<=1||void 0===arguments[1]?0:arguments[1],n=arguments.length<=2||void 0===arguments[2]?[]:arguments[2];null!=n[t]?(e.height=n[t]+1,n[t]+=1):(n[t]=0,e.height=0);var i=!0,u=!1,a=void 0;try{for(var l,o=(e.children||[])[Symbol.iterator]();!(i=(l=o.next()).done);i=!0){var c=l.value;r(c,t+1,n)}}catch(h){u=!0,a=h}finally{try{!i&&o["return"]&&o["return"]()}finally{if(u)throw a}}return n},collect=function n(e,t){var r=[],i=!0,u=!1,a=void 0;try{for(var l,o=(e.children||[])[Symbol.iterator]();!(i=(l=o.next()).done);i=!0){var c=l.value;r.push(t(e,c)),r=r.concat(n(c,t))}}catch(h){u=!0,a=h}finally{try{!i&&o["return"]&&o["return"]()}finally{if(u)throw a}}return r};exports.treeHeight=treeHeight,exports.buildTree=buildTree,exports.setHeight=setHeight,exports.collect=collect;
},{}],29:[function(require,module,exports){
"use strict";function _interopRequireDefault(e){return e&&e.__esModule?e:{"default":e}}Object.defineProperty(exports,"__esModule",{value:!0});var _connector=require("./connector"),_connector2=_interopRequireDefault(_connector),_linear=require("./linear"),_linear2=_interopRequireDefault(_linear),_ops=require("./ops"),_treeUtils=require("./tree-utils");exports["default"]=function(e){var t=e.data,r=e.width,n=e.height,i=e.children,o=e.tension;i||(i=function(e){return e.children});var u=(0,_treeUtils.buildTree)(t,i),l=(0,_treeUtils.treeHeight)(u),c=(0,_treeUtils.setHeight)(u),a=(0,_linear2["default"])([0,l-1],[0,r]),s=(0,_ops.range)(0,l).map(function(e){var t=Math.sqrt(e/(l-1))*n,r=(n-t)/2,i=r+t,o=e>0?c[e]+c[e-1]:c[e];return 0===o?function(e){return n/2}:(0,_linear2["default"])([0,o],[r,i])}),_=function(e){var t=e.level,r=s[t];return[a(t),r(e.height_)]},d=-1,f=(0,_treeUtils.collect)(u,function(e,t){return d+=1,t.height_=t.height+e.height,{connector:(0,_connector2["default"])({start:_(e),end:_(t),tension:o}),index:d,item:{start:e.item,end:t.item}}}),h=(0,_treeUtils.collect)(u,function(e,t){return{point:_(t),item:t.item}}),p={point:_(u),item:u.item};return{curves:f,nodes:[p].concat(h)}},module.exports=exports["default"];
},{"./connector":7,"./linear":14,"./ops":15,"./tree-utils":28}],30:[function(require,module,exports){
"use strict";function _interopRequireDefault(e){return e&&e.__esModule?e:{"default":e}}function Voronoi(e){var r=e.data,t=e.accessor,n=e.width,o=e.height,u=e.xrange,i=e.yrange,a=e.compute;"function"!=typeof t&&(t=function(e){return e}),u=u||[-1,1],i=i||[-1,1];var l=r.map(t),f=function(e){return e*e},c=(u[0]+u[1])/2,s=(i[0]+i[1])/2,p=Math.sqrt(f(u[0]-u[1])+f(i[0]-i[1])),_=(0,_linear2["default"])(u,[0,n]),d=(0,_linear2["default"])(i,[o,0]),y=10,h=[[y*(u[0]-p),y*s],[y*(u[1]+p),y*s],[y*c,y*(i[0]-p)],[y*c,y*(i[1]+p)]],v=h.concat(l),g=new _fortune2["default"](v),m=g.getPatches(),q=[],x=[];return l.forEach(function(e,t){var n=m[e].map(function(e){var r=_slicedToArray(e,2),t=r[0],n=r[1];return[_(t),d(n)]});q.push({point:[_(e[0]),d(e[1])],item:r[t]}),x.push((0,_ops.enhance)(a,{line:(0,_polygon2["default"])({points:n,closed:!0}),index:t,item:r[t]}))}),{curves:x,nodes:q,xscale:_,yscale:d}}Object.defineProperty(exports,"__esModule",{value:!0});var _slicedToArray=function(){function e(e,r){var t=[],n=!0,o=!1,u=void 0;try{for(var i,a=e[Symbol.iterator]();!(n=(i=a.next()).done)&&(t.push(i.value),!r||t.length!==r);n=!0);}catch(l){o=!0,u=l}finally{try{!n&&a["return"]&&a["return"]()}finally{if(o)throw u}}return t}return function(r,t){if(Array.isArray(r))return r;if(Symbol.iterator in Object(r))return e(r,t);throw new TypeError("Invalid attempt to destructure non-iterable instance")}}();exports["default"]=Voronoi;var _polygon=require("./polygon"),_polygon2=_interopRequireDefault(_polygon),_fortune=require("./fortune"),_fortune2=_interopRequireDefault(_fortune),_linear=require("./linear"),_linear2=_interopRequireDefault(_linear),_ops=require("./ops");module.exports=exports["default"];
},{"./fortune":10,"./linear":14,"./ops":15,"./polygon":18}],31:[function(require,module,exports){
"use strict";function _interopRequireDefault(e){return e&&e.__esModule?e:{"default":e}}Object.defineProperty(exports,"__esModule",{value:!0});var _slicedToArray=function(){function e(e,r){var t=[],a=!0,n=!1,i=void 0;try{for(var l,o=e[Symbol.iterator]();!(a=(l=o.next()).done)&&(t.push(l.value),!r||t.length!==r);a=!0);}catch(u){n=!0,i=u}finally{try{!a&&o["return"]&&o["return"]()}finally{if(n)throw i}}return t}return function(r,t){if(Array.isArray(r))return r;if(Symbol.iterator in Object(r))return e(r,t);throw new TypeError("Invalid attempt to destructure non-iterable instance")}}(),_linear=require("./linear"),_linear2=_interopRequireDefault(_linear),_rectangle=require("./rectangle"),_rectangle2=_interopRequireDefault(_rectangle),_ops=require("./ops");exports["default"]=function(e){var r=e.data,t=e.accessor,a=e.width,n=e.height,i=e.gutter,l=void 0===i?10:i,o=e.compute,u=e.min,c=void 0===u?0:u,f=e.max,d=void 0===f?0:f;t||(t=function(e){return e});var s=0,v=[],h=!0,y=!1,_=void 0;try{for(var p,m=r[Symbol.iterator]();!(h=(p=m.next()).done);h=!0){var g=p.value,x=t(g),b=x.value,w=x.absolute,q=w?[0,b||s]:[s,s+b],M=_slicedToArray(q,2),A=M[0],S=M[1],T=Math.min(A,S),D=Math.max(A,S);c=Math.min(c,T),d=Math.max(d,D),s=S,v.push({item:g,low:A,high:S,value:null!=b?b:S})}}catch(R){y=!0,_=R}finally{try{!h&&m["return"]&&m["return"]()}finally{if(y)throw _}}var j=v.length,O=(a-l*(j-1))/j,E=[],I=(0,_linear2["default"])([c,d],[n,0]),P=!0,k=!1,z=void 0;try{for(var B,C=v.entries()[Symbol.iterator]();!(P=(B=C.next()).done);P=!0){var F=_slicedToArray(B.value,2),G=F[0],g=F[1],H=G*(O+l),J=H+O,K=I(g.low),L=I(g.high),N=(0,_rectangle2["default"])({left:H,right:J,bottom:K,top:L});E.push((0,_ops.enhance)(o,{item:g.item,line:N,value:g.value,index:G}))}}catch(R){k=!0,z=R}finally{try{!P&&C["return"]&&C["return"]()}finally{if(k)throw z}}return{curves:E,scale:I}},module.exports=exports["default"];
},{"./linear":14,"./ops":15,"./rectangle":20}]},{},[1])


//# sourceMappingURL=dist/global/paths.js.map
