"""
Custom widgets for form template editing.
Includes a merge field selector for easy variable insertion.
"""
from django import forms
from django.utils.safestring import mark_safe
from django.templatetags.static import static
from ckeditor.widgets import CKEditorWidget
import json


class MergeFieldCKEditorWidget(CKEditorWidget):
    """
    CKEditor widget with an integrated merge field selector panel.

    Allows users to browse and insert template variables using a
    Salesforce-style dropdown interface instead of memorizing syntax.
    """

    class Media:
        css = {
            'all': ('documents/merge_field_selector.css',)
        }
        js = ('documents/merge_field_selector.js',)

    def __init__(self, config_name='default', *args, **kwargs):
        super().__init__(config_name=config_name, *args, **kwargs)

    def render(self, name, value, attrs=None, renderer=None):
        """Render the widget with merge field selector panel above CKEditor"""
        # Get the standard CKEditor HTML
        ckeditor_html = super().render(name, value, attrs, renderer)

        # Get merge field data
        from .variables import get_available_merge_fields
        merge_fields = get_available_merge_fields()

        # Generate the merge field selector HTML
        selector_html = self._render_selector_panel(name, merge_fields)

        # Combine selector + CKEditor
        return mark_safe(f"{selector_html}\n{ckeditor_html}")

    def _render_selector_panel(self, editor_name, merge_fields):
        """Generate HTML for the merge field selector panel"""
        # Convert merge fields to JSON for JavaScript
        merge_fields_json = json.dumps(merge_fields)

        html = f'''
<div class="merge-field-selector" id="merge-field-selector-{editor_name}">
    <div class="merge-field-header" onclick="toggleMergeFieldPanel('{editor_name}')">
        <span class="merge-field-icon">📋</span>
        <span class="merge-field-title">Merge Fields</span>
        <span class="merge-field-toggle">▶</span>
    </div>

    <div class="merge-field-content" id="merge-field-content-{editor_name}" style="display: none;">
        <div class="merge-field-instructions">
            Select a category and field to insert a variable into your template.
        </div>

        <div class="merge-field-controls">
            <div class="merge-field-row">
                <label for="merge-category-{editor_name}">Category:</label>
                <select id="merge-category-{editor_name}" class="merge-category-select">
                    <option value="">-- Select Category --</option>
                </select>
            </div>

            <div class="merge-field-row">
                <label for="merge-field-{editor_name}">Field:</label>
                <select id="merge-field-{editor_name}" class="merge-field-select" disabled>
                    <option value="">-- Select Field --</option>
                </select>
            </div>

            <div class="merge-field-row merge-variable-display" id="merge-variable-display-{editor_name}" style="display: none;">
                <label>Variable:</label>
                <code class="merge-variable-code" id="merge-variable-code-{editor_name}"></code>
            </div>

            <div class="merge-field-actions" id="merge-field-actions-{editor_name}" style="display: none;">
                <button type="button" class="button" onclick="copyMergeField('{editor_name}')">
                    📋 Copy to Clipboard
                </button>
                <button type="button" class="button button-primary" onclick="insertMergeField('{editor_name}')">
                    ➕ Insert at Cursor
                </button>
                <button type="button" class="button" onclick="previewTemplate('{editor_name}')">
                    👁️ Preview
                </button>
            </div>
        </div>
    </div>
</div>

<script type="text/javascript">
    // Store merge field data for this editor
    window.mergeFieldData = window.mergeFieldData || {{}};
    window.mergeFieldData['{editor_name}'] = {merge_fields_json};

    // Initialize the selector when document is ready
    if (document.readyState === 'loading') {{
        document.addEventListener('DOMContentLoaded', function() {{
            initializeMergeFieldSelector('{editor_name}');
        }});
    }} else {{
        initializeMergeFieldSelector('{editor_name}');
    }}
</script>
'''
        return html
