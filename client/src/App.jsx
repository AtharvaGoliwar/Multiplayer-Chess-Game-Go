import React from "react";
import ChessGame from "./ChessGame";
import AuthApp from "./AuthApp";
import { Routes, Route } from "react-router-dom";

function App() {
  return (
    <div className="App">
      {/* <ChessGame /> */}
      <Routes>
        <Route path="/" element={<AuthApp />} />
        <Route path="/home" element={<ChessGame />} />
      </Routes>
      {/* <AuthApp /> */}
    </div>
  );
}

export default App;
