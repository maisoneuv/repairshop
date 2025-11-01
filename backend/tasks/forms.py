from django import forms

from customers.models import Customer
from .models import WorkItem, Task
from dal import autocomplete
from crispy_forms.helper import FormHelper
from crispy_forms.layout import Layout, Field, HTML, Div, Submit


class WorkItemForm(forms.ModelForm):
    class Meta:
        model = WorkItem
        fields = ["customer", "customer_asset", "description", "device_condition", "accessories", "comments", "priority",
                  "intake_method", "owner", "type", "dropoff_point", "technician", "estimated_price", "prepaid_amount",
                  "payment_method"]

    def __init__(self, *args, **kwargs):
        user = kwargs.pop('user', None)
        super().__init__(*args, **kwargs)

        if not self.is_bound and user and hasattr(user, 'employee'):
            self.fields['owner'].initial = user.employee
            self.fields['dropoff_point'].initial = user.employee.location





class TaskForm(forms.ModelForm):
    class Meta:
        model = Task
        fields = ["summary", "description", "work_item", "assigned_employee", "due_date"]
        widgets = {
            "due_date": forms.SelectDateWidget()
        }
