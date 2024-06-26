import { ReactNode, createRef, useEffect, useState } from "react";

import ControllerListener from "./ControllerListener";
import css from "./index.module.css";

const VERSION = "1.1.0";

const CONFIG = {
  frameStart: 42,
  breakWindow: 20,
  correctSleepMs: 250,
  incorrectSleepMs: 2000,
  framesPerSecond: 60,
};

const params = new URLSearchParams(window.location.search);

const shortcutToInput: { [k: string]: string } = {
  1: "1",
  2: "2",
  3: "1+2",
  u: "1",
  i: "2",
  o: "1+2",
};
var shortcutToSet = "";

const videoCache: { [p: string]: string } = {};

var initialzed = false;
var initialze = () => {};
var onEnded = () => {};
var _speed = 1;
var nextStreak = 0;
var answer: string | null = null;
var videoTimeout: NodeJS.Timeout;
var inputTimeout: NodeJS.Timeout;
var keysPressed: { [k: string]: boolean } = {};

const historyLog: {
  answer: string;
  button: string;
  thisFrame: number;
  streak: number;
}[] = [];

export default function Main() {
  const mainRef = createRef<HTMLVideoElement>();
  const backupRef = createRef<HTMLVideoElement>();

  // return <SlicePreview />;

  function Video() {
    return (
      <div style={{ height: "100%" }}>
        <video
          className={css.video}
          ref={mainRef}
          style={{
            position: "absolute",
            height: "100%",
            maxWidth: "100%",
            zIndex: 1,
          }}
          playsInline
          autoPlay
          muted
          onEnded={onEnded}
        ></video>
        <video
          className={css.video}
          src={`video/blank.mp4`}
          ref={backupRef}
          style={{
            position: "absolute",
            height: "100%",
            maxWidth: "100%",
          }}
          autoPlay
          playsInline
          onCanPlay={() => {
            const t = backupRef.current!;
            t.pause();
            if (!initialzed) {
              initialzed = true;
              initialze();
              return;
            }
            const video = mainRef.current!;
            video.src = t.src;
            video.playbackRate = _speed;
          }}
        ></video>
      </div>
    );
  }

  function Helper(props: { children: ReactNode }) {
    const [_shortcutToSet, _updateShortcutToSet] = useState("");
    const updateShortcutToSet = (v: string) => {
      shortcutToSet = v;
      _updateShortcutToSet(v);
    };
    const [isP1, updateIsP1] = useState(true);
    const [isStanding, updateIsStanding] = useState(true);
    const [possibles, updatePossibles] = useState({
      "1": true,
      "2": true,
      "1+2": true,
    });
    const [speed, _updateSpeed] = useState(1);
    const updateSpeed = (newSpeed: number) => {
      const video = mainRef.current;
      if (!video) return;
      newSpeed = parseFloat(newSpeed.toFixed(2));
      video.playbackRate = newSpeed;
      _speed = newSpeed;
      _updateSpeed(newSpeed);
    };
    const [streak, updateStreak] = useState(0);
    const [highestStreak, updateHighestStreak] = useState(
      parseInt(localStorage.getItem("streak") || "0")
    );
    const [lastAnswer, updateLastAnswer] = useState("");
    const [lastInput, updateLastInput] = useState("");
    const [frame, updateFrame] = useState(0);
    const [isLoading, updateIsLoading] = useState(false);
    const [userGuideIsOpen, _updateUserGuideIsOpen] = useState(
      VERSION > (localStorage.getItem("VERSION") || "")
    );
    const updateUserGuideIsOpen = (_userGuideIsOpen: boolean) => {
      localStorage.setItem("VERSION", _userGuideIsOpen ? "" : VERSION);
      _updateUserGuideIsOpen(_userGuideIsOpen);
      if (initialzed) {
        // @ts-ignore
        window.location.reload(true);
      }
    };
    const [backgroundColor, updateBackgroundColor] = useState<
      string | undefined
    >(undefined);

    const getPath = (choice: string) =>
      `video/4_2_2024/${isP1 ? "p1" : "p2"}/${
        isStanding ? "standing" : "grounded"
      }/${choice.replace("+", "")}.mp4`;

    const prepVideo = () => {
      if (!initialzed) return;
      clearTimeout(videoTimeout);
      const choices = Object.entries(possibles)
        .map(([k, v]) => ({ k, v }))
        .filter(({ v }) => v)
        .map(({ k }) => k);
      const missing = choices
        .map((choice) => getPath(choice))
        .filter((p) => videoCache[p] === undefined);
      if (missing.length > 0) {
        updateIsLoading(true);
        Promise.all(
          missing.map((p) =>
            fetch(p, { cache: "force-cache" })
              .then((r) => r.blob())
              .then((blob) => window.URL.createObjectURL(blob))
              .then((src) => (videoCache[p] = src))
          )
        )
          .then(() => updateIsLoading(false))
          .then(() => prepVideo());
        return;
      }
      const nextChoice = choices[Math.floor(Math.random() * choices.length)];
      if (nextChoice === undefined) {
        return;
      }
      updateStreak(nextStreak);
      answer = nextChoice;
      backupRef.current!.src = videoCache[getPath(nextChoice)];
    };

    initialze = () => {
      prepVideo();
      ControllerListener(onKeyDownHelper);
    };

    useEffect(() => {
      nextStreak = 0;
      prepVideo();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isP1, isStanding, possibles]);
    const handleInput = (button: string) => {
      const video = mainRef.current;
      if (!video) return;
      if (answer === null) return;
      const rawFrame = Math.ceil(video.currentTime * CONFIG.framesPerSecond);
      const thisFrame = rawFrame - CONFIG.frameStart;
      if (thisFrame < 0) return;
      video.pause();
      const incorrect = thisFrame > CONFIG.breakWindow || button !== answer;
      updateBackgroundColor(
        !incorrect
          ? "rgba(0,0,30)" // right
          : button === answer
          ? "rgba(100,80,0)" // slow
          : "rgba(60,0,0)" // wrong
      );
      nextStreak = incorrect ? 0 : streak + 1;
      if (!incorrect) {
        updateStreak(nextStreak);
        if (nextStreak > highestStreak) {
          updateHighestStreak(nextStreak);
          localStorage.setItem("streak", nextStreak.toString());
        }
      }
      historyLog.push({ answer, button, thisFrame, streak: nextStreak });
      updateLastAnswer(answer);
      updateLastInput(button);
      updateFrame(thisFrame);
      answer = null;
      videoTimeout = setTimeout(
        () => prepVideo(),
        incorrect ? CONFIG.incorrectSleepMs : CONFIG.correctSleepMs
      );
    };
    onEnded = () => handleInput("-");
    const onKeyDownHelper = (key: string) => {
      clearTimeout(inputTimeout);
      if (userGuideIsOpen) {
        return;
      }
      if (shortcutToSet !== "") {
        shortcutToInput[key] = shortcutToSet;
        updateShortcutToSet(
          { "1": "2", "2": "1+2", "1+2": "" }[shortcutToSet]!
        );
        return;
      }
      const button = shortcutToInput[key];
      if (button === undefined) {
        initialzed = false;
        updateShortcutToSet("1");
        return;
      }
      keysPressed[button] = true;
      inputTimeout = setTimeout(() => {
        const allButtons =
          Object.keys(keysPressed).length === 1 ? button : shortcutToInput[3];
        keysPressed = {};
        handleInput(allButtons);
        // wait for half a frame - idk
      }, 1000 / CONFIG.framesPerSecond / 2);
    };
    return (
      <div
        tabIndex={1}
        ref={(c) => c?.focus()}
        onKeyDown={(e) => {
          console.log(e);
          if (["Alt", "Control", "Meta"].includes(e.key)) {
            if (params.has("debug")) {
              alert(
                JSON.stringify({ key: e.key, meta: e.metaKey, code: e.code })
              );
            }
            return;
          }
          onKeyDownHelper(e.key);
        }}
        style={{
          fontFamily: "Courier New",
          color: "#f3f3f8",
          backgroundColor: "#282a3a",
          height: "100vH",
          width: "100vW",
          display: "flex",
        }}
      >
        {userGuideIsOpen ? (
          <div
            style={{
              width: "100%",
              display: "flex",
              overflow: "scroll",
            }}
          >
            <div
              style={{ alignSelf: "center", flexGrow: 1, maxHeight: "100%" }}
            >
              <div
                style={{
                  maxWidth: "40em",
                  margin: "auto",
                }}
              >
                <h1>ThrowBreak420 v{VERSION}</h1>
                <h3
                  onClick={() => updateUserGuideIsOpen(false)}
                  style={{ cursor: "pointer" }}
                >
                  click here to continue
                </h3>
                <div>
                  <a
                    style={{ color: "white" }}
                    href={
                      "https://www.reddit.com/r/Tekken/comments/1avreg9/announcing_throwbreak420_an_online_tool/?"
                    }
                  >
                    reddit post
                  </a>
                </div>
                <div>
                  <a
                    style={{ color: "white" }}
                    href={"https://github.com/dcep93/throwbreak420/"}
                  >
                    source code
                  </a>
                </div>
                <p>
                  if you're like me, breaking a throw in a match is impossible,
                  and even in practice mode, it's too fast and subtle to
                  distinguish which arm it was!
                </p>
                <p>
                  this tool has several features to train us stoners on how to
                  recognize throws, and maybe someday, we will be able to
                  consitently break them in a match
                </p>
                <ul>
                  <li>control speed</li>
                  <li>
                    see which frame you pressed - were you close? throws have a
                    20 frame break window
                  </li>
                  <li>practice on any browser, even mobile</li>
                  <li>record your streak, brag to your wife's boyfriend</li>
                  <li>
                    ideally, there would be a random delay before the throw is
                    done, but it hasn't been implemented yet
                  </li>
                  <li>
                    short delay if you got the break correct, long delay if you
                    missed the break
                  </li>
                </ul>
                <div>
                  <div>UPDATE LOG:</div>
                  <ul>
                    <li>press 1 and 2 at the same time to trigger 1+2</li>
                    <li>remote debug capabilities</li>
                    <li>KING</li>
                    <li>shows history</li>
                    <li>better video caching</li>
                    <li>displays correctness background color</li>
                    <li>records highest streak</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        ) : _shortcutToSet !== "" ? (
          <div>set button {_shortcutToSet}</div>
        ) : (
          <div
            className={css.main}
            style={{
              flexGrow: 1,
              display: "flex",
              flexDirection: "column",
              backgroundColor,
            }}
          >
            <div>
              <form
                style={{ display: "flex", justifyContent: "space-around" }}
                onSubmit={(e) => e.preventDefault()}
              >
                <div>
                  {[true, false].map((t) => (
                    <div key={t ? "t" : "f"}>
                      <label>
                        <input
                          type="radio"
                          name="isP1"
                          checked={t === isP1}
                          onChange={() => updateIsP1(t)}
                        />
                        {t ? "p1" : "p2"}
                      </label>
                    </div>
                  ))}
                </div>
                <div>
                  {[true, false].map((t) => (
                    <div key={t ? "t" : "f"}>
                      <label>
                        <input
                          type="radio"
                          name="isStanding"
                          checked={t === isStanding}
                          onChange={() => updateIsStanding(t)}
                        />
                        {t ? "standing" : "grounded"}
                      </label>
                    </div>
                  ))}
                </div>
                <div>
                  {Object.entries(possibles).map(([k, v]) => (
                    <div key={k}>
                      <label>
                        <input
                          type={"checkbox"}
                          checked={v}
                          onChange={() =>
                            updatePossibles(
                              Object.assign({}, possibles, {
                                [k]: !v,
                              })
                            )
                          }
                        />
                        {k} break
                      </label>
                    </div>
                  ))}
                </div>
                <div>
                  <div>speed: {speed.toFixed(2)}</div>
                  <div>
                    <button
                      disabled={speed <= 0.2}
                      onClick={() => updateSpeed(speed - 0.05)}
                    >
                      ➖
                    </button>
                    <button
                      disabled={speed >= 2}
                      onClick={() => updateSpeed(speed + 0.05)}
                    >
                      ➕
                    </button>
                  </div>
                </div>
              </form>
            </div>
            <div
              style={{
                flexGrow: 1,
              }}
            >
              {isLoading ? (
                <h1 style={{ textAlign: "center" }}>LOADING...</h1>
              ) : null}
              <div
                className={css.dual_center}
                style={{
                  opacity: isLoading ? 0 : undefined,
                  height: "100%",
                  width: "100%",
                  display: "flex",
                }}
              >
                <div
                  style={{
                    paddingLeft: "2em",
                    width: "13em",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div>
                    <div>answer: {lastAnswer}</div>
                    <div>input: {lastInput}</div>
                    <div>frame: {frame}</div>
                    <div>streak: {streak}</div>
                    <div style={{ paddingTop: "1em" }}>
                      highest streak: {highestStreak}
                    </div>
                    <div>
                      <button
                        style={{ cursor: "pointer" }}
                        onClick={() => updateUserGuideIsOpen(true)}
                      >
                        User Guide
                      </button>
                    </div>
                  </div>
                  <div
                    className={css.hidden_on_tall}
                    style={{
                      flexGrow: 1,
                      position: "relative",
                      overflow: "scroll",
                      paddingTop: "5em",
                    }}
                  >
                    <div>HISTORY</div>
                    <table
                      style={{
                        fontSize: "small",
                        position: "absolute",
                      }}
                    >
                      <thead>
                        <tr>
                          <td>answer</td>
                          <td>input</td>
                          <td>frame</td>
                          <td>streak</td>
                        </tr>
                      </thead>
                      <tbody>
                        {historyLog
                          .slice()
                          .reverse()
                          .map((o, i) => (
                            <tr key={i}>
                              <td>{o.answer}</td>
                              <td>{o.button}</td>
                              <td>{o.thisFrame}</td>
                              <td>{o.streak}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div
                  style={{
                    flexGrow: 1,
                    position: "relative",
                  }}
                >
                  {props.children}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-around" }}>
              {Object.keys(possibles).map((k) => (
                <div key={k}>
                  <button
                    style={{ padding: "1em", fontSize: "xx-large" }}
                    onClick={() => handleInput(k)}
                  >
                    {k}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <Helper>
      <Video />
    </Helper>
  );
}
