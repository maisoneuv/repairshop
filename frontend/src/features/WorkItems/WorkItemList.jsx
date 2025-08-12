import { useEffect, useState } from "react";
import WorkItemForm from "./WorkItemForm";

export default function WorkItemList() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");

  const fetchItems = () => {
    fetch("http://localhost:8000/tasks/work-items/")
      .then(res => {
        if (!res.ok) throw new Error("API error");
        return res.json();
      })
      .then(data => setItems(data))
      .catch(err => setError(err.message));
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const handleNewItem = (item) => {
    setItems(prev => [item, ...prev]);
  };

  return (
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left side: Form takes 2/3 width on large screens */}
          <div className="lg:col-span-4">
              <WorkItemForm />
          </div>

          {/* Right side: Placeholder for additional content */}
          <div className="hidden lg:block">
              {/* Add notes, timeline, etc. here */}
          </div>
      </div>
  );
}
