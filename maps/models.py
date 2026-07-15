from django.db import models
from django.contrib.auth.models import User
from django.contrib.gis.db import models as gis_models

# ... existing models (Barangay, Section, Lot, Issue) ...

class PasswordRequest(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='password_requests')
    request_type = models.CharField(max_length=20, choices=[('reset', 'Reset Password'), ('help', 'General Help')])
    status = models.CharField(max_length=20, choices=[('pending', 'Pending'), ('approved', 'Approved'), ('denied', 'Denied')], default='pending')
    message = models.TextField(blank=True, default='') # User's initial message
    admin_response = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Request from {self.user.username} - {self.status}"


class Notification(models.Model):
    recipient = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    title = models.CharField(max_length=100)
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"To {self.recipient.username}: {self.title}"


class Barangay(models.Model):
    name = models.CharField(max_length=100, unique=True)
    color = models.CharField(max_length=7, default='#3388ff')  # hex color for CAD legend

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class Section(models.Model):
    barangay = models.ForeignKey(Barangay, on_delete=models.CASCADE, related_name='sections')
    number = models.IntegerField()

    class Meta:
        ordering = ['barangay', 'number']
        unique_together = ('barangay', 'number')

    def __str__(self):
        return f"{self.barangay.name} - Section {self.number}"


class Lot(models.Model):
    section = models.ForeignKey(Section, on_delete=models.CASCADE, related_name='lots')
    lot_number = models.IntegerField()
    owner = models.CharField(max_length=200, blank=True, default='')
    address = models.CharField(max_length=300, blank=True, default='')
    pin = models.CharField(max_length=50, blank=True, default='')
    market_value = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    assessment_value = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    rpt = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    land_use = models.JSONField(default=list)  # e.g. ['Residential'], ['Residential','Agricultural']
    area_sqm = models.DecimalField(max_digits=15, decimal_places=2, default=0)

    class Meta:
        ordering = ['section', 'lot_number']
        unique_together = ('section', 'lot_number')

    def __str__(self):
        return f"Lot {self.lot_number} - {self.section}"


class Issue(models.Model):
    STATUS_CHOICES = [
        ('unsolved', 'Unsolved'),
        ('solved', 'Solved'),
    ]
    description = models.TextField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='unsolved')
    solved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"[{self.status}] {self.description[:60]}"


class LotAdjustment(models.Model):
    pin = models.CharField(max_length=50, unique=True)
    adjustment_rate = models.DecimalField(max_digits=4, decimal_places=2, default=1.0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['pin']

    def __str__(self):
        return f"{self.pin} - {self.adjustment_rate}"


class CadAlalum(gis_models.Model):
    id = models.BigIntegerField(primary_key=True)
    geom = gis_models.GeometryField(srid=4326)

    class Meta:
        managed = False
        db_table = 'cad_alalum'


class CadMap(gis_models.Model):
    id = models.BigAutoField(primary_key=True)
    barangay_name = models.TextField()
    source_file = models.TextField()
    properties = models.JSONField(default=dict)
    geom = gis_models.MultiPolygonField(srid=4326)

    class Meta:
        managed = False
        db_table = 'cad_maps'


class PimBarangayBoundary(gis_models.Model):
    id = models.BigAutoField(primary_key=True)
    barangay_name = models.TextField()
    source_file = models.TextField()
    properties = models.JSONField(default=dict)
    geom = gis_models.MultiPolygonField(srid=4326)

    class Meta:
        managed = False
        db_table = 'pim_barangay_boundaries'


class PimSection(gis_models.Model):
    id = models.BigAutoField(primary_key=True)
    barangay_name = models.TextField()
    section_number = models.IntegerField()
    source_file = models.TextField()
    properties = models.JSONField(default=dict)
    geom = gis_models.MultiPolygonField(srid=4326)

    class Meta:
        managed = False
        db_table = 'pim_sections'


class PimEnlargement(gis_models.Model):
    id = models.BigAutoField(primary_key=True)
    barangay_name = models.TextField()
    section_number = models.IntegerField()
    source_file = models.TextField()
    properties = models.JSONField(default=dict)
    geom = gis_models.MultiPolygonField(srid=4326)

    class Meta:
        managed = False
        db_table = 'pim_enlargements'
