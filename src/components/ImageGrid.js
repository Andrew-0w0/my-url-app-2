import React from "react";

export default function ImageGrid({ urls }) {
  if (!urls || urls.length === 0) {
    return <p className="text-gray-400">還沒有圖片，請輸入網址新增</p>;
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      {urls.map((url, index) => (
        <img
          key={index}
          src={url}
          alt={`img-${index}`}
          className="w-full h-48 object-cover rounded-md"
          onError={(e) => (e.target.style.display = "none")}
        />
      ))}
    </div>
  );
}
