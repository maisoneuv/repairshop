/**
 * Merge Field Selector - JavaScript functionality
 * Provides Salesforce-style merge field insertion for CKEditor templates
 */

// Global state for current selections
window.mergeFieldState = {};

/**
 * Initialize merge field selector for a specific editor
 */
function initializeMergeFieldSelector(editorName) {
    const mergeFields = window.mergeFieldData[editorName];
    if (!mergeFields) {
        console.error('No merge field data found for editor:', editorName);
        return;
    }

    // Initialize state
    window.mergeFieldState[editorName] = {
        currentCategory: null,
        currentField: null,
        currentVariable: null
    };

    // Populate category dropdown
    const categorySelect = document.getElementById(`merge-category-${editorName}`);
    if (categorySelect) {
        // Clear existing options except the first
        categorySelect.innerHTML = '<option value="">-- Select Category --</option>';

        // Add categories
        Object.keys(mergeFields).forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            categorySelect.appendChild(option);
        });

        // Add event listener
        categorySelect.addEventListener('change', function() {
            onCategoryChange(editorName, this.value);
        });
    }

    // Add event listener to field select
    const fieldSelect = document.getElementById(`merge-field-${editorName}`);
    if (fieldSelect) {
        fieldSelect.addEventListener('change', function() {
            onFieldChange(editorName, this.value);
        });
    }
}

/**
 * Handle category selection change
 */
function onCategoryChange(editorName, category) {
    const fieldSelect = document.getElementById(`merge-field-${editorName}`);
    const mergeFields = window.mergeFieldData[editorName];
    const state = window.mergeFieldState[editorName];

    // Update state
    state.currentCategory = category;
    state.currentField = null;
    state.currentVariable = null;

    // Clear field selection
    fieldSelect.innerHTML = '<option value="">-- Select Field --</option>';

    // Hide variable display and actions
    hideElement(`merge-variable-display-${editorName}`);
    hideElement(`merge-field-actions-${editorName}`);

    if (!category) {
        fieldSelect.disabled = true;
        return;
    }

    // Enable and populate field dropdown
    fieldSelect.disabled = false;
    const fields = mergeFields[category];

    Object.keys(fields).forEach(fieldName => {
        const option = document.createElement('option');
        option.value = fieldName;
        option.textContent = fieldName;
        fieldSelect.appendChild(option);
    });
}

/**
 * Handle field selection change
 */
function onFieldChange(editorName, fieldName) {
    const mergeFields = window.mergeFieldData[editorName];
    const state = window.mergeFieldState[editorName];

    if (!state.currentCategory || !fieldName) {
        hideElement(`merge-variable-display-${editorName}`);
        hideElement(`merge-field-actions-${editorName}`);
        return;
    }

    // Get the variable syntax
    const variable = mergeFields[state.currentCategory][fieldName];
    state.currentField = fieldName;
    state.currentVariable = `{{${variable}}}`;

    // Display the variable
    const variableDisplay = document.getElementById(`merge-variable-code-${editorName}`);
    if (variableDisplay) {
        variableDisplay.textContent = state.currentVariable;
    }

    // Show variable display and actions
    showElement(`merge-variable-display-${editorName}`);
    showElement(`merge-field-actions-${editorName}`);
}

/**
 * Copy merge field to clipboard
 */
function copyMergeField(editorName) {
    const state = window.mergeFieldState[editorName];
    if (!state.currentVariable) {
        return;
    }

    // Modern clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(state.currentVariable)
            .then(() => {
                showNotification('Copied to clipboard!', 'success');
            })
            .catch(err => {
                console.error('Failed to copy:', err);
                fallbackCopy(state.currentVariable);
            });
    } else {
        fallbackCopy(state.currentVariable);
    }
}

/**
 * Fallback copy method for older browsers
 */
function fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();

    try {
        document.execCommand('copy');
        showNotification('Copied to clipboard!', 'success');
    } catch (err) {
        console.error('Fallback copy failed:', err);
        showNotification('Failed to copy. Please copy manually.', 'error');
    }

    document.body.removeChild(textarea);
}

/**
 * Insert merge field at cursor in CKEditor
 */
function insertMergeField(editorName) {
    const state = window.mergeFieldState[editorName];
    if (!state.currentVariable) {
        return;
    }

    // Get CKEditor instance
    const editorId = `id_html_content`; // Standard Django form field naming
    const editor = window.CKEDITOR && window.CKEDITOR.instances[editorId];

    if (!editor) {
        console.error('CKEditor instance not found');
        showNotification('Editor not found', 'error');
        return;
    }

    // Insert the variable at cursor position
    editor.insertText(state.currentVariable);

    // Focus back on editor
    editor.focus();

    showNotification('Variable inserted!', 'success');
}

/**
 * Toggle merge field panel (expand/collapse)
 */
function toggleMergeFieldPanel(editorName) {
    const content = document.getElementById(`merge-field-content-${editorName}`);
    const toggle = document.querySelector(`#merge-field-selector-${editorName} .merge-field-toggle`);

    if (content.style.display === 'none') {
        content.style.display = 'block';
        if (toggle) toggle.textContent = '▼';
    } else {
        content.style.display = 'none';
        if (toggle) toggle.textContent = '▶';
    }
}

/**
 * Preview template with sample data
 */
function previewTemplate(editorName) {
    const editorId = `id_html_content`;
    const editor = window.CKEDITOR && window.CKEDITOR.instances[editorId];

    if (!editor) {
        showNotification('Editor not found', 'error');
        return;
    }

    // Get current HTML content
    const htmlContent = editor.getData();

    // Get template ID if editing existing template
    const templateIdInput = document.querySelector('input[name="id"]');
    const templateId = templateIdInput ? templateIdInput.value : null;

    // Construct preview URL
    const previewUrl = templateId
        ? `/api/documents/templates/${templateId}/preview/`
        : `/api/documents/templates/preview/`;

    // Open preview in new window
    const previewWindow = window.open('', 'Template Preview', 'width=800,height=600');
    previewWindow.document.write('<html><head><title>Template Preview</title></head><body><p>Loading preview...</p></body></html>');

    // Fetch preview
    fetch(previewUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCookie('csrftoken')
        },
        body: JSON.stringify({ html_content: htmlContent })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Preview failed');
        }
        return response.text();
    })
    .then(html => {
        previewWindow.document.open();
        previewWindow.document.write(html);
        previewWindow.document.close();
    })
    .catch(error => {
        console.error('Preview error:', error);
        previewWindow.document.write(`<html><body><p>Error: Failed to generate preview</p></body></html>`);
        showNotification('Preview failed', 'error');
    });
}

/**
 * Helper function to show element
 */
function showElement(id) {
    const element = document.getElementById(id);
    if (element) {
        element.style.display = 'flex';
    }
}

/**
 * Helper function to hide element
 */
function hideElement(id) {
    const element = document.getElementById(id);
    if (element) {
        element.style.display = 'none';
    }
}

/**
 * Show notification message
 */
function showNotification(message, type) {
    // Try to use Django's messages framework if available
    const messagesDiv = document.querySelector('.messagelist');
    if (messagesDiv) {
        const messageItem = document.createElement('li');
        messageItem.className = type === 'error' ? 'error' : 'success';
        messageItem.textContent = message;
        messagesDiv.appendChild(messageItem);

        // Remove after 3 seconds
        setTimeout(() => {
            messageItem.remove();
        }, 3000);
    } else {
        // Fallback to alert
        alert(message);
    }
}

/**
 * Get CSRF token from cookie
 */
function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}
