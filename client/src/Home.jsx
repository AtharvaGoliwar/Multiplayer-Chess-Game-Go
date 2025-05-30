import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Home() {
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState(null);
  return (
    <>
      <div style={{ color: "white" }}>Home Page</div>
      <input
        type="text"
        placeholder="Enter room ID"
        onChange={(e) => {
          setRoomId(e.target.value);
        }}
      />
      <button onClick={() => navigate(`/room/${roomId}`)}>Submit</button>
    </>
  );
}
