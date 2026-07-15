from django.test import TestCase, Client
from django.contrib.auth.models import User
from .models import Notification
from rest_framework_simplejwt.tokens import RefreshToken

class NotificationTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='password123')
        self.notification = Notification.objects.create(
            recipient=self.user,
            title="Test Notif",
            message="Test Message"
        )
        refresh = RefreshToken.for_user(self.user)
        self.token = str(refresh.access_token)
        self.client = Client()

    def get_auth_headers(self):
        return {'HTTP_AUTHORIZATION': f'Bearer {self.token}'}

    def test_get_notifications(self):
        response = self.client.get('/api/auth/notifications/', **self.get_auth_headers())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()['notifications']), 1)

    def test_delete_single_notification(self):
        response = self.client.delete(f'/api/auth/notifications/{self.notification.id}/', **self.get_auth_headers())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Notification.objects.count(), 0)

    def test_clear_all_notifications(self):
        Notification.objects.create(recipient=self.user, title="Notif 2", message="Msg 2")
        self.assertEqual(Notification.objects.count(), 2)
        
        response = self.client.delete('/api/auth/notifications/', **self.get_auth_headers())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Notification.objects.count(), 0)

    def test_mark_all_as_read(self):
        response = self.client.post('/api/auth/notifications/', {}, content_type='application/json', **self.get_auth_headers())
        self.assertEqual(response.status_code, 200)
        self.notification.refresh_from_db()
        self.assertTrue(self.notification.is_read)
