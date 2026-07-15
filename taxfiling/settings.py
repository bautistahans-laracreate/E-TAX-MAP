from datetime import timedelta
import os
from pathlib import Path

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# GeoDjango (PostGIS backend) requires native GDAL/GEOS DLLs on Windows.
if os.name == "nt":
    # Potential installation paths for QGIS or OSGeo4W
    possible_roots = [
        r"C:\OSGeo4W",
        r"C:\OSGeo4W64",
        r"D:\OSGeo4W",
        r"D:\OSGeo4W64",
        r"A:\QGIS",
    ]
    
    # Check Program Files for QGIS installations
    for pf in [os.environ.get("ProgramFiles", "C:\\Program Files"), os.environ.get("ProgramFiles(x86)", "C:\\Program Files (x86)")]:
        if os.path.exists(pf):
            for d in os.listdir(pf):
                if d.startswith("QGIS"):
                    possible_roots.append(os.path.join(pf, d))

    OSGEO4W_ROOT = None
    for root in possible_roots:
        if os.path.exists(os.path.join(root, "bin", "geos_c.dll")):
            OSGEO4W_ROOT = root
            break
            
    if OSGEO4W_ROOT:
        OSGEO4W_BIN = os.path.join(OSGEO4W_ROOT, "bin")
        OSGEO4W_PROJ = os.path.join(OSGEO4W_ROOT, "share", "proj")
        OSGEO4W_GDAL = os.path.join(OSGEO4W_ROOT, "apps", "gdal", "share", "gdal")

        GEOS_LIBRARY_PATH = os.path.join(OSGEO4W_BIN, "geos_c.dll")
        
        # GDAL DLL name can vary (e.g., gdal312.dll, gdal304.dll)
        import glob
        gdal_dlls = glob.glob(os.path.join(OSGEO4W_BIN, "gdal*.dll"))
        if gdal_dlls:
            GDAL_LIBRARY_PATH = gdal_dlls[0]
        else:
            GDAL_LIBRARY_PATH = os.path.join(OSGEO4W_BIN, "gdal312.dll")

        os.environ["PROJ_LIB"] = OSGEO4W_PROJ
        os.environ["PROJ_DATA"] = OSGEO4W_PROJ
        os.environ["GDAL_DATA"] = OSGEO4W_GDAL
        
        if OSGEO4W_BIN not in os.environ.get("PATH", ""):
            os.environ["PATH"] = OSGEO4W_BIN + os.pathsep + os.environ.get("PATH", "")
    else:
        # If not found, you may need to install QGIS/OSGeo4W or set the paths manually.
        pass



# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/6.0/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = 'django-insecure-@8w#6o0$dnn6llpr%jufkeeq0rtt=lc*7_-6^t+r=7imxi1y^q'

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = True

ALLOWED_HOSTS = ['localhost', '127.0.0.1']

CSRF_TRUSTED_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
]


# Application definition

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework_simplejwt.token_blacklist',
    'maps.apps.MapsConfig',
    "django.contrib.gis",
    'corsheaders',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = True

# ── Django REST Framework ──────────────────────────────────────────────────
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=30),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'AUTH_HEADER_TYPES': ('Bearer',),
}

ROOT_URLCONF = 'taxfiling.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'taxfiling.wsgi.application'


# Database
# https://docs.djangoproject.com/en/6.0/ref/settings/#databases

# Explicit environment-driven DB config.
# Defaults below are only for local development.
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_NAME = os.getenv("DB_NAME", "taxfiling")
DB_USER = os.getenv("DB_USER", "taxuser")
DB_PORT = os.getenv("DB_PORT", "5433")
DB_PASSWORD = os.getenv("DB_PASSWORD")

if not DB_PASSWORD:
    if DEBUG:
        DB_PASSWORD = "pops1245"
    else:
        raise RuntimeError("DB_PASSWORD is required when DEBUG=False")

DATABASES = {
    "default": {
        "ENGINE": "django.contrib.gis.db.backends.postgis",
        "NAME": DB_NAME,
        "USER": DB_USER,
        "PASSWORD": DB_PASSWORD,
        "HOST": DB_HOST,
        "PORT": DB_PORT,
    }
}



# Password validation
# https://docs.djangoproject.com/en/6.0/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Internationalization
# https://docs.djangoproject.com/en/6.0/topics/i18n/

LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'UTC'

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/6.0/howto/static-files/

STATIC_URL = 'static/'

STATICFILES_DIRS = [
    BASE_DIR / 'maps/static'
]

# Email settings
EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'
