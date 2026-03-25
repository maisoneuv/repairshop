from rest_framework import serializers
from .models import Note, Address, User, Role, RolePermission, UserRole, Setting
from decimal import Decimal
from datetime import datetime
from django.contrib.auth.models import Permission



class NoteSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()
    source_model = serializers.SerializerMethodField()
    source_id = serializers.SerializerMethodField()

    class Meta:
        model = Note
        fields = ["id", "content", "created_at", "author_name", "source_model", "source_id"]

    def get_author_name(self, obj):
        """Return the author's full name (first + last), falling back to email if empty, or None for system notes"""
        if obj.author is None:
            return None

        # Concatenate first_name and last_name
        full_name = f"{obj.author.first_name} {obj.author.last_name}".strip()

        # Fall back to email if no name is set
        return full_name if full_name else obj.author.email

    def get_source_model(self, obj):
        """Return the model name of the object this note is attached to"""
        return obj.content_type.model if obj.content_type else None

    def get_source_id(self, obj):
        """Return the ID of the object this note is attached to"""
        return obj.object_id

class AddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = Address
        fields = ["street", "city", "postal_code", "country", "building_number", "apartment_number"]

class UserSerializer(serializers.ModelSerializer):
    has_pin = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'email', 'is_active', 'is_staff', 'is_superuser', 'name', 'first_name', 'last_name', 'has_pin']
        read_only_fields = ['id', 'is_superuser', 'has_pin']

    def get_has_pin(self, obj):
        return bool(obj.pin_hash)

class PermissionSerializer(serializers.ModelSerializer):
    content_type = serializers.StringRelatedField()

    class Meta:
        model = Permission
        fields = ['id', 'codename', 'name', 'content_type']

class RoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Role
        fields = ['id', 'name', 'description']

class RolePermissionSerializer(serializers.ModelSerializer):
    permission = PermissionSerializer(read_only=True)
    permission_id = serializers.PrimaryKeyRelatedField(
        queryset=Permission.objects.all(), source='permission', write_only=True
    )

    class Meta:
        model = RolePermission
        fields = ['id', 'role', 'permission', 'permission_id']

class UserRoleSerializer(serializers.ModelSerializer):
    role = RoleSerializer()
    user = UserSerializer()

    class Meta:
        model = UserRole
        fields = ['id', 'user', 'role']

class UserRoleCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserRole
        fields = ['user', 'role']

#current user's permissions
class MyPermissionSerializer(serializers.Serializer):
    permission_codename = serializers.CharField()
    permission_name = serializers.CharField()
    content_type = serializers.CharField()

class MyPermissionsResponseSerializer(serializers.Serializer):
    is_superuser = serializers.BooleanField()
    is_staff = serializers.BooleanField()
    permissions = MyPermissionSerializer(many=True)


class SettingSerializer(serializers.ModelSerializer):
    """Serializer for individual Setting objects."""
    value = serializers.SerializerMethodField()
    is_global = serializers.SerializerMethodField()

    class Meta:
        model = Setting
        fields = [
            'id',
            'key',
            'value',
            'value_type',
            'description',
            'is_global',
            'created_on',
            'modified_on',
        ]
        read_only_fields = ['id', 'created_on', 'modified_on']

    def get_value(self, obj):
        """Return the properly typed value."""
        return obj.value

    def get_is_global(self, obj):
        """Indicate if this is a global setting."""
        return obj.tenant is None


class SettingWriteSerializer(serializers.ModelSerializer):
    """Serializer for creating/updating Setting objects."""
    value = serializers.JSONField(write_only=True)

    class Meta:
        model = Setting
        fields = ['key', 'value', 'value_type', 'description']

    def validate(self, data):
        """Validate value matches the declared value_type."""
        value = data.get('value')
        value_type = data.get('value_type')

        if value_type == 'string':
            if not isinstance(value, str):
                raise serializers.ValidationError({
                    'value': 'Value must be a string for string type.'
                })
        elif value_type == 'numeric':
            if not isinstance(value, (int, float, Decimal)):
                raise serializers.ValidationError({
                    'value': 'Value must be a number for numeric type.'
                })
        elif value_type == 'boolean':
            if not isinstance(value, bool):
                raise serializers.ValidationError({
                    'value': 'Value must be a boolean for boolean type.'
                })
        elif value_type == 'date':
            # Accept string in ISO format
            if isinstance(value, str):
                try:
                    datetime.strptime(value, '%Y-%m-%d')
                except ValueError:
                    raise serializers.ValidationError({
                        'value': 'Date must be in YYYY-MM-DD format.'
                    })
            else:
                raise serializers.ValidationError({
                    'value': 'Date must be a string in YYYY-MM-DD format.'
                })

        return data

    def create(self, validated_data):
        value = validated_data.pop('value')
        instance = Setting(**validated_data)
        instance.value = value
        instance.save()
        return instance

    def update(self, instance, validated_data):
        value = validated_data.pop('value', None)
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        if value is not None:
            instance.value = value
        instance.save()
        return instance