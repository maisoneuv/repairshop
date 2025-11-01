from django import forms
from .models import Customer, Asset


CONTACT_METHOD_ERROR = "Please provide at least one contact method."


class CustomerForm(forms.ModelForm):
    class Meta:
        model = Customer
        fields = ["first_name", "last_name", "email", "phone_number", "address"]

    def clean(self):
        cleaned_data = super().clean()
        email = cleaned_data.get("email")
        phone = cleaned_data.get("phone_number")

        if not email and not phone:
            raise forms.ValidationError(CONTACT_METHOD_ERROR)

        return cleaned_data


class CustomerAssetForm(forms.ModelForm):
    class Meta:
        model = Asset
        fields = ["serial_number", "customer", "device"]


class CustomerInlineForm(forms.ModelForm):
    class Meta:
        model = Customer
        fields = ["phone_number", "email", "first_name", "last_name", "referral_source"]

    def clean(self):
        cleaned_data = super().clean()
        email = cleaned_data.get("email")
        phone = cleaned_data.get("phone_number")

        if not email and not phone:
            raise forms.ValidationError(CONTACT_METHOD_ERROR)

        return cleaned_data


class CustomerAssetInlineForm(forms.ModelForm):
    class Meta:
        model = Asset
        fields = ["serial_number", "device"]
