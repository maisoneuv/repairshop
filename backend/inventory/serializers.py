from rest_framework import serializers
from .models import Device, Category

class DeviceSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)

    class Meta:
        model = Device
        fields = ['id', 'manufacturer', 'model', 'category', 'category_name']

    def validate(self, data):
        request = self.context.get('request')
        unknown_manufacturer = request.data.get('unknown_manufacturer')
        unknown_model = request.data.get('unknown_model')

        if not unknown_model and not data.get('model'):
            raise serializers.ValidationError({"model": "This field is required unless marked as unknown."})

        if not unknown_manufacturer and not data.get('manufacturer'):
            raise serializers.ValidationError({"manufacturer": "This field is required unless marked as unknown."})

        return data


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name']