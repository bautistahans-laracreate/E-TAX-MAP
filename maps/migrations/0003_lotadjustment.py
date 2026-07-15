from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('maps', '0002_notification_passwordrequest'),
    ]

    operations = [
        migrations.CreateModel(
            name='LotAdjustment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('pin', models.CharField(max_length=50, unique=True)),
                ('adjustment_rate', models.DecimalField(decimal_places=2, default=0.75, max_digits=4)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['pin'],
            },
        ),
    ]
