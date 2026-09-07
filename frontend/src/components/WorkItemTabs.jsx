import { useState } from 'react';

export default function WorkItemTabs({
    children,
    defaultTab = 'details',
    tabs: tabsProp,
    activeTab: activeTabProp,
    onTabChange,
    flush = false,
}) {
    const [internalTab, setInternalTab] = useState(defaultTab);
    // Controlled when the page needs to drive the tab itself (e.g. Overview's
    // "Add photos" jumping to the Photos tab); uncontrolled otherwise.
    const activeTab = activeTabProp ?? internalTab;
    const setActiveTab = onTabChange ?? setInternalTab;

    const tabs = tabsProp ?? [
        { id: 'details', label: 'Details' },
        { id: 'inventory', label: 'Inventory' },
        { id: 'photos', label: 'Photos' },
        { id: 'documents', label: 'Documents' },
        { id: 'emails', label: 'Emails' },
        { id: 'actions', label: 'Actions' },
    ];

    return (
        <div className={flush
            // On a white page a shadowed card reads as a floating panel; the
            // prototype separates the tab strip with a rule instead.
            ? ''
            : 'bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden'}>
            {/* Tab Headers */}
            <div className="border-b border-gray-200">
                <nav className={`flex space-x-8 ${flush ? 'px-1' : 'px-6'}`} aria-label="Tabs">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                                activeTab === tab.id
                                    ? 'border-blue-600 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </nav>
            </div>

            {/* Tab Content */}
            <div className={flush ? 'py-3' : 'p-3'}>
                {children({ activeTab })}
            </div>
        </div>
    );
}