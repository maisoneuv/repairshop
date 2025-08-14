from rest_framework import serializers
from .models import Employee, Location
from core.models import User

class EmployeeSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source='user.name')
    email = serializers.EmailField(source='user.email')

    class Meta:
        model = Employee
        fields = ['id', 'name', 'email', 'role', 'tenant']

class UserMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'first_name', 'last_name', 'name', 'email']

class CurrentEmployeeSerializer(serializers.ModelSerializer):
    user = UserMiniSerializer(read_only=True)
    location_name = serializers.CharField(source='location.name', read_only=True)

    class Meta:
        model = Employee
        fields = ['id', 'user', 'location_id', 'location_name', 'role']

class LocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Location
        fields = ['id', 'name']