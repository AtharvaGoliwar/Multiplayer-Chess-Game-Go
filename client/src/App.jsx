import React from "react";
import ChessGame from "./ChessGame";
import AuthApp from "./AuthApp";
import { Routes, Route, Navigate } from "react-router-dom";
import Home from "./Home";

function App() {
  return (
    <div className="App">
      {/* <ChessGame /> */}
      <Routes>
        <Route path="/" element={<AuthApp />} />
        <Route path="/home" element={<Home />} />
        <Route path="/room/:roomId" element={<ChessGame />} />
        <Route path="/room" element={<Navigate to="/home" replace />} />
      </Routes>
      {/* <AuthApp /> */}
    </div>
  );
}

export default App;
