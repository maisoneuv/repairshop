import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';

export default function Portal({ children, container = null }) {
    const [mountNode, setMountNode] = useState(null);

    useEffect(() => {
        let node = container;
        let portalRoot = null;

        if (!node) {
            // Create or find a portal root
            portalRoot = document.getElementById('portal-root');
            if (!portalRoot) {
                portalRoot = document.createElement('div');
                portalRoot.id = 'portal-root';
                portalRoot.style.position = 'relative';
                portalRoot.style.zIndex = '9999';
                document.body.appendChild(portalRoot);
            }
            node = portalRoot;
        }

        setMountNode(node);

        return () => {
            // Cleanup if we created the portal root and it's empty
            if (portalRoot && portalRoot.children.length === 0) {
                document.body.removeChild(portalRoot);
            }
        };
    }, [container]);

    return mountNode ? createPortal(children, mountNode) : null;
}