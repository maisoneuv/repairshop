from rest_framework import serializers
from .models import Note, Address, User, Role, RolePermission, UserRole
from django.contrib.auth.models import Permission



class NoteSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.name", read_only=True)
    source_model = serializers.SerializerMethodField()
    source_id = serializers.SerializerMethodField()

    class Meta:
        model = Note
        fields = ["id", "content", "created_at", "author_name", "source_model", "source_id"]

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
    class Meta:
        model = User
        fields = ['id', 'email', 'is_active', 'is_staff', 'is_superuser', 'name', 'first_name', 'last_name']
        read_only_fields = ['id', 'is_superuser']

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