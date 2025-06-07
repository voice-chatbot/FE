import React, { useState, useEffect, useRef } from "react";
import { Room, RoomEvent } from "livekit-client";
import "./App.css";

function App() {
  const [room, setRoom] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [messages, setMessages] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
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
          setIsConnected(true);
        });

        room.on(RoomEvent.Disconnected, () => {
          console.log("Disconnected from room");
          setIsConnected(false);
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

    try {
      const url = "wss://chat-e7jp6qc0.livekit.cloud";

      const response = await fetch("http://localhost:5000/getToken", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const { token } = await response.json();
      console.log({ token });

      await room.connect(url, token);
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
    if (!room || !isConnected) {
      console.error("Not connected to room");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioTrack = stream.getAudioTracks()[0];
      console.log({ audioTrack });
      // Publish the audio track to LiveKit room
      await room.localParticipant.publishTrack(audioTrack);

      setIsRecording(true);
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
    if (!room || !isRecording) return;

    try {
      // Get all tracks from the local participant
      const tracks = room.localParticipant.tracks;
      // Unpublish each track
      for (const [_, publication] of tracks) {
        if (publication.track) {
          await room.localParticipant.unpublishTrack(publication.track);
        }
      }
      setIsRecording(false);
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

  return (
    <div className="App">
      <div className="chatbot-container">
        <h1>Voice Chatbot</h1>
        <div className="connection-status">
          {isConnected ? "Connected" : "Disconnected"}
        </div>
        <div className="chat-interface">
          <div className="messages">
            {messages.map((msg, index) => (
              <div key={index} className={`message ${msg.type}`}>
                {msg.content}
              </div>
            ))}
          </div>
          <div className="controls">
            {!isConnected ? (
              <button className="connect-button" onClick={connectToRoom}>
                Connect to Chat
              </button>
            ) : (
              <button
                className={`record-button ${isRecording ? "recording" : ""}`}
                onClick={isRecording ? stopRecording : startRecording}
              >
                {isRecording ? "Stop Recording" : "Start Recording"}
              </button>
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
