from django.urls import path
from .views import *
from django.contrib.auth.views import LoginView
from rest_framework.routers import DefaultRouter

note_list = NoteViewSet.as_view({"get": "list", "post": "create"})

router = DefaultRouter()
router.register(r'users', UserViewSet, basename='user')
router.register(r'permissions', PermissionViewSet, basename='permission')
router.register(r'roles', RoleViewSet, basename='role')
router.register(r'role-permissions', RolePermissionViewSet, basename='rolepermission')
router.register(r'user-roles', UserRoleViewSet, basename='userrole')
router.register(r'settings', SettingViewSet, basename='setting')
router.register(r'picklist-admin', PicklistAdminViewSet, basename='picklist-admin')
router.register(r'custom-fields', CustomFieldViewSet, basename='custom-field')
router.register(r'email-templates', EmailTemplateViewSet, basename='email-template')

# Custom paths must come BEFORE router.urls so they aren't swallowed by users/<pk>/
urlpatterns = [
    path('', home_view, name="home"),
    path("notes/<str:model>/<int:obj_id>/", note_list, name="note-list"),
    path('me/permissions/', MyPermissionsView.as_view(), name='my-permissions'),
    path("login/", login_view, name="login"),
    path("logout/", logout_view, name="logout"),
    path("quick-login/", quick_login_view, name="quick-login"),
    path("users/me/pin/", set_my_pin_view, name="set-my-pin"),
    path("users/<int:user_id>/pin/", set_user_pin_view, name="set-user-pin"),
    path("users/pinned/", list_pinned_users_view, name="list-pinned-users"),
    path("users/<int:pk>/send-reset/", TriggerPasswordResetView.as_view(), name="send-password-reset"),
    path("auth/reset-password/confirm/", PasswordResetConfirmView.as_view(), name="password-reset-confirm"),
    path("email-settings/", TenantEmailSettingsView.as_view(), name="email-settings"),
    path("email-settings/send-verification/", SendEmailVerificationView.as_view(), name="email-settings-send-verification"),
    path("email-settings/verify/<uuid:token>/", VerifyEmailAddressView.as_view(), name="email-settings-verify"),
    path("emails/send/", SendEmailView.as_view(), name="send-email"),
    path("emails/<str:model>/<int:obj_id>/", EmailMessageListView.as_view(), name="email-message-list"),
    path("session-ping/", session_ping, name="session-ping"),
    path("search/", GlobalSearchView.as_view(), name="global-search"),
    path("picklist/<str:category>/", PicklistValuesView.as_view(), name="picklist-values"),
]

urlpatterns += router.urls