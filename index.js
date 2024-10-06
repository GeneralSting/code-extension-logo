if (!("console" in window)) {
  window.console = { log: function () {}, error: function () {} };
}

function $(s) {
  return document.querySelector(s);
}
function $$(s) {
  return document.querySelectorAll(s);
}

// Globals
var logo, turtle;

function hook(orig, func) {
  return function () {
    try {
      func.apply(this, arguments);
    } finally {
      if (orig) orig.apply(this, arguments);
    }
  };
}

//
// Input UI
//
var input = {};
function initInput() {
  function keyNameForEvent(e) {
    window.ke = e;
    return (
      e.key ||
      {
        3: "Enter",
        10: "Enter",
        13: "Enter",
        38: "ArrowUp",
        40: "ArrowDown",
        63232: "ArrowUp",
        63233: "ArrowDown",
      }[e.keyCode]
    );
  }

  input.setMulti = function () {
    // TODO: Collapse these to a single class?
    document.body.classList.remove("single");
    document.body.classList.add("multi");
  };

  input.setSingle = function () {
    // TODO: Collapse these to a single class?
    document.body.classList.remove("multi");
    document.body.classList.add("single");
  };

  var isMulti = function () {
    return document.body.classList.contains("multi");
  };

  function run(remote) {
    if (remote !== true && window.TogetherJS && window.TogetherJS.running) {
      TogetherJS.send({ type: "run" });
    }
    var error = $("#display #error");
    error.classList.remove("shown");

    var v = "repeat 5 [ fd 100 rt 144 ]edn";

    console.log(v);
    if (v === "") {
      return;
    }

    setTimeout(function () {
      document.body.classList.add("running");
      logo
        .run(v)
        .catch(function (e) {
          error.innerHTML = "";
          error.appendChild(document.createTextNode(e.message));
          error.classList.add("shown");
        })
        .then(function () {
          document.body.classList.remove("running");
        });
    }, 100);
  }

  run();

  function stop() {
    logo.bye();
    document.body.classList.remove("running");
  }

  input.run = run;

  function clear(remote) {
    if (remote !== true && window.TogetherJS && window.TogetherJS.running) {
      TogetherJS.send({ type: "clear" });
    }
    input.setValue("");
  }
  input.clear = clear;

  if (typeof CodeMirror !== "undefined") {
    var BRACKETS = "()[]{}";

    // Single Line
    CodeMirror.keyMap["single-line"] = {
      Enter: function (cm) {
        run();
      },
      Up: function (cm) {
        var v = commandHistory.prev();
        if (v !== undefined) {
          cm.setValue(v);
          cm.setCursor({ line: 0, ch: v.length });
        }
      },
      Down: function (cm) {
        var v = commandHistory.next();
        if (v !== undefined) {
          cm.setValue(v);
          cm.setCursor({ line: 0, ch: v.length });
        }
      },
      fallthrough: ["default"],
    };
    var cm = CodeMirror.fromTextArea($("#logo-ta-single-line"), {
      autoCloseBrackets: { pairs: BRACKETS, explode: false },
      matchBrackets: true,
      lineComment: ";",
      keyMap: "single-line",
    });
    $("#logo-ta-single-line + .CodeMirror").id = "logo-cm-single-line";

    // https://stackoverflow.com/questions/13026285/codemirror-for-just-one-line-textfield
    cm.setSize("100%", cm.defaultTextHeight() + 4 + 4); // 4 = theme padding

    // Handle paste - switch to multi-line if input is multiple lines
    cm.on("change", function (cm, change) {
      if (change.text.length > 1) {
        var v = input.getValue();
        input.setMulti();
        input.setValue(v);
        input.setFocus();
      }
    });

    // Multi-Line
    var cm2 = CodeMirror.fromTextArea($("#logo-ta-multi-line"), {
      autoCloseBrackets: { pairs: BRACKETS, explode: BRACKETS },
      matchBrackets: true,
      lineComment: ";",
      lineNumbers: true,
    });
    $("#logo-ta-multi-line + .CodeMirror").id = "logo-cm-multi-line";
    cm2.setSize("100%", "100%");

    // Handle ctrl+enter in Multi-Line
    cm2.on("keydown", function (instance, event) {
      if (keyNameForEvent(event) === "Enter" && event.ctrlKey) {
        event.preventDefault();
        run();
      }
    });

    input.getValue = function () {
      return (isMulti() ? cm2 : cm).getValue();
    };
    input.setValue = function (v) {
      (isMulti() ? cm2 : cm).setValue(v);
    };
    input.setFocus = function () {
      (isMulti() ? cm2 : cm).focus();
    };
  } else {
    input.getValue = function () {
      return $(isMulti() ? "#logo-ta-multi-line" : "#logo-ta-single-line")
        .value;
    };
    input.setValue = function (v) {
      $(isMulti() ? "#logo-ta-multi-line" : "#logo-ta-single-line").value = v;
    };
  }

  window.addEventListener("message", function (e) {
    if ("example" in e.data) {
      var text = e.data.example;
      input.setSingle();
      input.setValue(text);
      input.setFocus();
    }
  });
}

//
// Canvas resizing
//
(function () {
  window.addEventListener("resize", resize);
  window.addEventListener("DOMContentLoaded", resize);
  function resize() {
    var box = $("#display-panel .inner"),
      rect = box.getBoundingClientRect(),
      w = rect.width,
      h = rect.height;
    $("#sandbox").width = w;
    $("#sandbox").height = h;
    $("#turtle").width = w;
    $("#turtle").height = h;
    $("#overlay").width = w;
    $("#overlay").height = h;

    if (logo && turtle) {
      turtle.resize(w, h);
      logo.run("cs");
    }
  }
})();

//
// Main page logic
//
window.addEventListener("DOMContentLoaded", function () {
  // Parse query string
  var queryParams = {},
    queryRest;
  (function () {
    if (document.location.search) {
      document.location.search
        .substring(1)
        .split("&")
        .forEach(function (entry) {
          var match = /^(\w+)=(.*)$/.exec(entry);
          if (match)
            queryParams[decodeURIComponent(match[1])] = decodeURIComponent(
              match[2]
            );
          else queryRest = "?" + entry;
        });
    }
  })();

  $("#overlay").style.fontSize = "13px";
  $("#overlay").style.fontFamily = "monospace";
  $("#overlay").style.color = "black";

  function asyncResult(value) {
    return new Promise(function (resolve) {
      setTimeout(function () {
        resolve(value);
      }, 0);
    });
  }

  var stream = {
    read: function (s) {
      return Dialog.prompt(s ? s : "");
    },
    write: function () {
      var div = $("#overlay");
      for (var i = 0; i < arguments.length; i += 1) {
        div.innerHTML += escapeHTML(arguments[i]);
      }
      div.scrollTop = div.scrollHeight;
      return asyncResult();
    },
    clear: function () {
      var div = $("#overlay");
      div.innerHTML = "";
      return asyncResult();
    },
    readback: function () {
      var div = $("#overlay");
      return asyncResult(div.innerHTML);
    },
    get textsize() {
      return parseFloat($("#overlay").style.fontSize.replace("px", ""));
    },
    set textsize(height) {
      $("#overlay").style.fontSize = Math.max(height, 1) + "px";
    },
    get font() {
      return $("#overlay").style.fontFamily;
    },
    set font(name) {
      if (
        ["serif", "sans-serif", "cursive", "fantasy", "monospace"].indexOf(
          name
        ) === -1
      )
        name = JSON.stringify(name);
      $("#overlay").style.fontFamily = name;
    },
    get color() {
      return $("#overlay").style.color;
    },
    set color(color) {
      $("#overlay").style.color = color;
    },
  };

  var canvas_element = $("#sandbox"),
    canvas_ctx = canvas_element.getContext("2d"),
    turtle_element = $("#turtle"),
    turtle_ctx = turtle_element.getContext("2d");
  turtle = new CanvasTurtle(
    canvas_ctx,
    turtle_ctx,
    canvas_element.width,
    canvas_element.height,
    $("#overlay")
  );

  logo = new LogoInterpreter(turtle, stream, function (name, def) {
    if (savehook) {
      savehook(name, def);
    }
  });
  logo.run("cs");

  initInput();
});
