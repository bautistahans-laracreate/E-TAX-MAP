"""
Seed the database with 32 San Pascual barangays, sample sections,
lots (with realistic mixed land-use), and auto-detected issues.
"""
import random
from django.db import models
from django.core.management.base import BaseCommand
from maps.models import Barangay, Section, Lot, Issue

BARANGAY_DATA = [
    ("Alalum", "#7ec8e3"),        ("Antipolo", "#ff6b6b"),
    ("Balimbing", "#51cf66"),     ("Banaba", "#ffd43b"),
    ("Bayanan", "#845ef7"),       ("Danglayan", "#ff922b"),
    ("Del Pilar", "#20c997"),     ("Gelerang Kawayan", "#e64980"),
    ("Ilat North", "#339af0"),    ("Ilat South", "#22b8cf"),
    ("Kaingin", "#94d82d"),       ("Laurel", "#f06595"),
    ("Malaking Pook", "#9775fa"), ("Mataas na Lupa", "#cc5de8"),
    ("Natunuan North", "#5c7cfa"),("Natunuan South", "#f783ac"),
    ("Padre Castillo", "#38d9a9"),("Palsahingin", "#fd7e14"),
    ("Pila", "#adb5bd"),          ("Poblacion 1", "#e03131"),
    ("Poblacion 2", "#c92a2a"),   ("Poblacion 3", "#a61e1e"),
    ("Poblacion 4", "#8b1818"),   ("Pook ni Banal", "#2f9e44"), ("Pook ni Kapitan", "#f08c00"),
    ("Resplandor", "#1971c2"),    ("Sambat", "#e8590c"),
    ("San Antonio", "#0ca678"),   ("San Mariano", "#66a80f"),
    ("San Mateo", "#3bc9db"),     ("Santa Elena", "#b197fc"),
    ("Santo Niño", "#fcc419"),
]

LAND_USE_OPTIONS = [
    ["Residential"],
    ["Agricultural"],
    ["Commercial"],
    ["Industrial"],
    ["Residential", "Agricultural"],
    ["Residential", "Commercial"],
    ["Agricultural", "Commercial"],
    ["Residential", "Agricultural", "Commercial"],
    ["Residential", "Industrial"],
    ["Commercial", "Industrial"],
]

FIRST_NAMES = [
    "Juan", "Maria", "Jose", "Ana", "Pedro", "Rosa", "Carlos", "Elena",
    "Miguel", "Teresa", "Ramon", "Carmen", "Fernando", "Isabel", "Antonio",
    "Luz", "Manuel", "Patricia", "Roberto", "Gloria", "Ricardo", "Sofia",
    "Luis", "Angela", "Eduardo", "Cristina", "Alejandro", "Beatriz",
]
LAST_NAMES = [
    "Santos", "Reyes", "Cruz", "Bautista", "Del Rosario", "Ramos", "Mendoza",
    "Garcia", "Torres", "Flores", "Rivera", "Gonzales", "Hernandez", "Lopez",
    "Perez", "Castillo", "Villanueva", "De Leon", "Aquino", "Mercado",
]


class Command(BaseCommand):
    help = "Seed 32 San Pascual barangays with sections, lots, and issues"

    def handle(self, *args, **options):
        self.stdout.write("Clearing old data...")
        Issue.objects.all().delete()
        Lot.objects.all().delete()
        Section.objects.all().delete()
        Barangay.objects.all().delete()

        self.stdout.write("Creating barangays...")
        barangays = []
        for name, color in BARANGAY_DATA:
            b = Barangay.objects.create(name=name, color=color)
            barangays.append(b)

        self.stdout.write("Creating sections and lots...")
        lot_counter = 0
        pin_brgy_index = 0
        for brgy in barangays:
            pin_brgy_index += 1
            num_sections = random.randint(1, 4)
            for sec_num in range(1, num_sections + 1):
                section = Section.objects.create(barangay=brgy, number=sec_num)
                num_lots = random.randint(5, 15)
                for lot_num in range(1, num_lots + 1):
                    lot_counter += 1
                    # 15% chance of missing some data to generate issues
                    is_incomplete = random.random() < 0.15

                    owner = "" if is_incomplete and random.random() < 0.5 else (
                        f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"
                    )
                    pin_val = "" if is_incomplete and random.random() < 0.5 else (
                        f"040-{pin_brgy_index:03d}-{sec_num:03d}-{lot_num:04d}"
                    )
                    land_use = random.choice(LAND_USE_OPTIONS)
                    area = float(f"{random.uniform(50, 5000):.2f}")
                    mv = float(f"{area * random.uniform(500, 5000):.2f}")
                    av = float(f"{mv * random.uniform(0.15, 0.40):.2f}")
                    rpt_val = float(f"{av * 0.02:.2f}")

                    Lot.objects.create(
                        section=section,
                        lot_number=lot_num,
                        owner=owner,
                        address=f"Brgy. {brgy.name}, San Pascual, Batangas" if owner else "",
                        pin=pin_val,
                        market_value=mv,
                        assessment_value=av,
                        rpt=rpt_val,
                        land_use=land_use,
                        area_sqm=area,
                    )

        self.stdout.write(f"Created {lot_counter} lots across {Section.objects.count()} sections.")

        # ── Auto-detect issues ──────────────────────────────────────────
        self.stdout.write("Detecting issues...")
        issues_created = 0

        # Check if fewer than 32 barangays loaded
        brgy_count = Barangay.objects.count()
        if brgy_count < 32:
            Issue.objects.create(
                description=f"System has only {brgy_count} of 32 barangays for PIM OVERVIEW."
            )
            issues_created += 1

        # Check each lot for missing data
        for lot in Lot.objects.select_related('section__barangay').all():
            missing = []
            if not lot.owner:
                missing.append("Owner")
            if not lot.pin:
                missing.append("PIN")
            if not lot.address:
                missing.append("Address")
            if lot.market_value == 0:
                missing.append("Market Value")
            if lot.assessment_value == 0:
                missing.append("Assessment Value")
            if lot.area_sqm == 0:
                missing.append("Area per sqm")
            if not lot.land_use:
                missing.append("Landuse")

            if missing:
                desc = (
                    f"Lot {lot.lot_number} of Section {lot.section.number} of "
                    f"{lot.section.barangay.name}, San Pascual, Batangas is missing: "
                    f"{', '.join(missing)}."
                )
                Issue.objects.create(description=desc)
                issues_created = issues_created + 1

        # Check sections with no lots
        for sec in Section.objects.annotate(lot_count=models.Count('lots')).filter(lot_count=0):
            Issue.objects.create(
                description=f"Section {sec.number} of {sec.barangay.name} has no lots/parcels."
            )
            issues_created = issues_created + 1

        self.stdout.write(self.style.SUCCESS(
            f"Done! {brgy_count} barangays, {Section.objects.count()} sections, "
            f"{lot_counter} lots, {issues_created} issues."
        ))
