from django.core.management.base import BaseCommand
from core.models import *
from iam.models import User, Folder
from django.conf import settings


class Command(BaseCommand):
    help = "Displays instance status"

    def handle(self, *args, **kwargs):
        nb_users = User.objects.all().count()
        nb_first_login = User.objects.filter(first_login=True).count()
        nb_libraries = LoadedLibrary.objects.all().count()
        nb_domains = Folder.objects.filter(content_type="DO").count()
        nb_perimeters = Perimeter.objects.all().count()
        nb_assets = Asset.objects.all().count()
        nb_threats = Threat.objects.all().count()
        nb_functions = ReferenceControl.objects.all().count()
        nb_measures = AppliedControl.objects.all().count()
        nb_evidences = Evidence.objects.all().count()
        nb_compliance_assessments = ComplianceAssessment.objects.all().count()
        nb_risk_assessments = RiskAssessment.objects.all().count()
        nb_risk_scenarios = RiskScenario.objects.all().count()
        nb_risk_acceptances = RiskAcceptance.objects.all().count()
        nb_seats = getattr(settings, "LICENSE_SEATS", 0)
        nb_editors = len(User.get_editors())
        expiration = getattr(settings, "LICENSE_EXPIRATION", "")

        created_at = Folder.get_root_folder().created_at
        last_login = max(
            [
                x["last_login"]
                for x in User.objects.all().values("last_login")
                if x["last_login"]
            ],
            default=None,
        )
        self.stdout.write(
            f"created_at={created_at.strftime('%Y-%m-%dT%H:%M')} last_login={last_login.strftime('%Y-%m-%dT%H:%M') if last_login else last_login} "
            + f"users={nb_users} first_logins={nb_first_login} libraries={nb_libraries} "
            + f"domains={nb_domains} perimeters={nb_perimeters} assets={nb_assets} "
            + f"threats={nb_threats} functions={nb_functions} measures={nb_measures} "
            + f"evidences={nb_evidences} compliance={nb_compliance_assessments} risk={nb_risk_assessments} "
            + f"scenarios={nb_risk_scenarios} acceptances={nb_risk_acceptances} "
            + f"seats={nb_seats} editors={nb_editors} expiration={expiration}"
        )
