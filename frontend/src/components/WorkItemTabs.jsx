import { useState } from 'react';

export default function WorkItemTabs({ children, defaultTab = 'details' }) {
    const [activeTab, setActiveTab] = useState(defaultTab);

    const tabs = [
        { id: 'details', label: 'Details' },
        { id: 'inventory', label: 'Inventory' }
    ];

    return (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            {/* Tab Headers */}
            <div className="border-b border-gray-200">
                <nav className="flex space-x-8 px-6" aria-label="Tabs">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                                activeTab === tab.id
                                    ? 'border-indigo-500 text-indigo-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </nav>
            </div>

            {/* Tab Content */}
            <div className="p-6">
                {children({ activeTab })}
            </div>
        </div>
    );
}