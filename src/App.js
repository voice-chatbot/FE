import React, { useState, useEffect, useRef } from "react";
import { Room, RoomEvent } from "livekit-client";
import { CiMicrophoneOn } from "react-icons/ci";
import { CiMicrophoneOff } from "react-icons/ci";
import "./App.css";
import { ThreeDot } from "react-loading-indicators";

function App() {
  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState({
    isRecording: false,
    isConnected: false,
    isConnecting: false,
    isProcessing: false,
  });
  const audioRef = useRef(null);

  useEffect(() => {
    // Initialize LiveKit room
    const initializeRoom = async () => {
      try {
        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
        });

        // Handle room events
        room.on(RoomEvent.Connected, () => {
          console.log("Connected to room");
          setStatus((prev) => ({ ...prev, isConnected: true }));
        });

        room.on(RoomEvent.Disconnected, () => {
          console.log("Disconnected from room");
          setStatus((prev) => ({ ...prev, isConnected: false }));
        });

        // Handle incoming audio from backend
        room.on(
          RoomEvent.TrackSubscribed,
          (track, publication, participant) => {
            console.log({ track, publication, participant });
            if (
              track.kind === "audio" &&
              participant.identity === "backend-bot"
            ) {
              console.log("Received audio from backend");
              setStatus((prev) => ({ ...prev, isProcessing: false })); // Reset processing state when audio is received
              const audioElement = audioRef.current;
              if (audioElement) {
                // Attach the track to the audio element
                track.attach(audioElement);

                // Ensure audio plays
                const playAudio = async () => {
                  try {
                    await audioElement.play();
                    console.log("Audio playback started");
                  } catch (error) {
                    console.error("Error playing audio:", error);
                    // Try to play again if it failed
                    if (error.name === "NotAllowedError") {
                      console.log("Trying to play audio again...");
                      await audioElement.play();
                    }
                  }
                };

                // Handle audio playback
                audioElement.onloadedmetadata = () => {
                  playAudio();
                };

                // Handle track ended event
                track.on("ended", () => {
                  console.log("Audio track ended");
                  audioElement.pause();
                });

                // Handle track muted event
                track.on("muted", () => {
                  console.log("Audio track muted");
                });

                // Handle track unmuted event
                track.on("unmuted", () => {
                  console.log("Audio track unmuted");
                  playAudio(); // Try to play again when unmuted
                });
              }
            }
          }
        );

        setRoom(room);

        // Connect to room immediately after initialization
        await connectToRoom();
      } catch (error) {
        console.error("Error initializing room:", error);
      }
    };

    initializeRoom();

    return () => {
      if (room) {
        room.disconnect();
      }
    };
  }, []);

  const connectToRoom = async () => {
    if (!room) return;
    setStatus((prev) => ({ ...prev, isConnecting: true }));
    try {
      const url = process.env.REACT_APP_LIVEKIT_URL;

      const response = await fetch(
        process.env.REACT_APP_BACKEND_URL + "/getToken",
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const { token } = await response.json();
      console.log({ token });

      await room.connect(url, token);
      setStatus((prev) => ({ ...prev, isConnecting: false }));
    } catch (error) {
      console.error("Error connecting to room");
      setMessages((prev) => [
        ...prev,
        {
          type: "error",
          content: "Failed to connect to chat server. Please try again.",
        },
      ]);
    }
  };

  const startRecording = async () => {
    if (!room || !status.isConnected) {
      console.error("Not connected to room");
      return;
    }

    try {
      setStatus((prev) => ({ ...prev, isRecording: true }));
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioTrack = stream.getAudioTracks()[0];
      console.log({ audioTrack });
      // Publish the audio track to LiveKit room
      await room.localParticipant.publishTrack(audioTrack);

      setMessages((prev) => [
        ...prev,
        {
          type: "user",
          content: "Recording started",
        },
      ]);
    } catch (error) {
      console.error("Error starting recording:", error);
      setMessages((prev) => [
        ...prev,
        {
          type: "error",
          content:
            "Failed to start recording. Please check microphone permissions.",
        },
      ]);
    }
  };

  const stopRecording = async () => {
    if (!room || !status.isRecording) return;

    try {
      // Get all tracks from the local participant
      const tracks = room.localParticipant.tracks;
      // Unpublish each track
      for (const [_, publication] of tracks) {
        if (publication.track) {
          await room.localParticipant.unpublishTrack(publication.track);
        }
      }
      setStatus((prev) => ({
        ...prev,
        isRecording: false,
        isProcessing: true,
      }));
      setMessages((prev) => [
        ...prev,
        {
          type: "user",
          content: "Recording stopped",
        },
      ]);
    } catch (error) {
      console.error("Error stopping recording:", error);
      setMessages((prev) => [
        ...prev,
        {
          type: "error",
          content: "Failed to stop recording.",
        },
      ]);
    }
  };

  // Add effect to handle audio track subscription and processing state
  useEffect(() => {
    if (room) {
      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (track.kind === "audio" && participant.identity === "backend-bot") {
          setStatus((prev) => ({ ...prev, isProcessing: false })); // Reset processing state when audio track is received
        }
      });
    }
  }, [room]);

  const generateWaveform = () => {
    const bars = [];
    for (let i = 0; i < 50; i++) {
      const height = status.isRecording
        ? Math.random() * 60 + 10
        : Math.sin(i * 0.2) * 20 + 30;
      bars.push(
        <div
          key={i}
          className={`bg-gradient-to-t from-purple-500 to-pink-400 rounded-full transition-all duration-150 ${
            status.isRecording ? "animate-wave" : ""
          }`}
          style={{
            height: `${height}px`,
            width: "3px",
            opacity: status.isRecording ? Math.random() * 0.8 + 0.2 : 0.6,
            animationDelay: `${i * 0.02}s`,
          }}
        />
      );
    }
    return bars;
  };

  return (
    <div className="App">
      <div className="chatbot-container">
        <div className="flex items-center justify-center mb-4">
          <div className="w-3 h-10 bg-gradient-to-b from-red-500 to-pink-500 rounded-full mr-3" />
          <h1 className="text-5xl font-bold text-white">AI Voice Chatbot</h1>
        </div>
        <div className="chat-interface">
          <div className="relative mb-12">
            <div className="flex items-end justify-center space-x-1 h-32 mb-8">
              {generateWaveform()}
            </div>

            {/* Glow effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-purple-500/20 to-transparent blur-xl" />
          </div>
          <p className="text-lg mb-6 text-gray-300">How can I help you?</p>
          <div className="controls flex flex-col items-center">
            {!status.isConnected ? (
              <button
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white px-8 py-3 rounded-full text-lg font-medium transition-all duration-200 transform hover:scale-105"
                onClick={connectToRoom}
              >
                {status.isConnecting ? (
                  <ThreeDot color="white" />
                ) : (
                  "Connect to Chat"
                )}
              </button>
            ) : (
              <button
                className={`w-16 h-16 rounded-full transition-all duration-200 transform hover:scale-110 flex items-center justify-center ${
                  status.isRecording
                    ? "bg-red-500 hover:bg-red-600 animate-pulse"
                    : status.isProcessing
                    ? "bg-yellow-500 hover:bg-yellow-600"
                    : "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                }`}
                onClick={status.isRecording ? stopRecording : startRecording}
                disabled={status.isProcessing}
              >
                {status.isRecording ? (
                  <CiMicrophoneOff className="w-6 h-6 text-white" />
                ) : (
                  <CiMicrophoneOn className="w-6 h-6 text-white" />
                )}
              </button>
            )}
            {status.isRecording && (
              <p className="text-sm text-gray-400 mt-4 animate-pulse">
                Listening...
              </p>
            )}
            {status.isProcessing && (
              <p className="text-sm text-gray-400 mt-4 animate-pulse">
                Processing your request...
              </p>
            )}
          </div>
        </div>
        <audio
          ref={audioRef}
          autoPlay
          playsInline
          controls={false}
          style={{ display: "none" }}
        />
      </div>
    </div>
  );
}

export default App;
