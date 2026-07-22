import React from "react";
import testImage from "../images/images.png"; // 確定這裡大小寫完全正確

const Sidebar = () => {
  return (
    <div style={{ width: "250px", background: "#ddd", padding: "20px" }}>
      <h2>Sidebar 測試</h2>
      <img
        src={testImage}
        alt="Sidebar Test"
        style={{ width: "200px", height: "200px", border: "2px solid black" }}
      />
    </div>
  );
};

export default Sidebar;
