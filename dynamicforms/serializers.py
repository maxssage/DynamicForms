from django.db import models

from rest_framework import serializers

from dynamicforms.action import ActionControls
from dynamicforms.settings import TEMPLATE
from .fields import *
from .mixins import UUIDMixIn, ActionMixin


class ModelSerializer(UUIDMixIn, ActionMixin, serializers.ModelSerializer):
    """
    DynamicForms' ModelSerializer overrides the following behaviour over DRF's implementation:

    * Uses own field types for construction
    * Adds form UUID (rendered in html too)
    * Adds processing for form-wide errors

    DRF's docstring copied verbatim:

    A `ModelSerializer` is just a regular `Serializer`, except that:

    * A set of default fields are automatically populated.
    * A set of default validators are automatically populated.
    * Default `.create()` and `.update()` implementations are provided.

    The process of automatically determining a set of serializer fields
    based on the model fields is reasonably complex, but you almost certainly
    don't need to dig into the implementation.

    If the `ModelSerializer` class *doesn't* generate the set of fields that
    you need you should either declare the extra/differing fields explicitly on
    the serializer class, or simply use a `Serializer` class.
    """

    serializer_field_mapping = {
        models.AutoField: IntegerField,
        models.BigIntegerField: IntegerField,
        models.BooleanField: BooleanField,
        models.CharField: CharField,
        models.CommaSeparatedIntegerField: CharField,
        models.DateField: DateField,
        models.DateTimeField: DateTimeField,
        models.DecimalField: DecimalField,
        models.EmailField: EmailField,
        models.Field: ModelField,
        models.FileField: FileField,
        models.FloatField: FloatField,
        models.ImageField: ImageField,
        models.IntegerField: IntegerField,
        models.NullBooleanField: NullBooleanField,
        models.PositiveIntegerField: IntegerField,
        models.PositiveSmallIntegerField: IntegerField,
        models.SlugField: SlugField,
        models.SmallIntegerField: IntegerField,
        models.TextField: CharField,
        models.TimeField: TimeField,
        models.URLField: URLField,
        models.GenericIPAddressField: IPAddressField,
        models.FilePathField: FilePathField,
    }
    if models.DurationField is not None:
        serializer_field_mapping[models.DurationField] = DurationField

    serializer_related_field = PrimaryKeyRelatedField
    serializer_related_to_field = SlugRelatedField
    serializer_url_field = HyperlinkedIdentityField
    serializer_choice_field = ChoiceField

    template_name = TEMPLATE + 'base_form.html'  #: template filename for single record view (HTMLFormRenderer)
    controls = ActionControls(add_default_crud=True)
    form_titles = {
        'table': '',
        'new': '',
        'edit': '',
    }

    show_filter = False  # When true, filter row is shown for list view
    serializer_type = None  # Current types: None, 'filter'

    @property
    def has_non_field_errors(self):
        """
        Reports whether validation turned up any form-wide validation errors. Used in templates to render the form-wide
        error message

        :return: True | False depending on whether form validation failed
        """
        if hasattr(self, '_errors'):
            return 'non_field_errors' in self.errors
        return False

    @property
    def page_title(self):
        """
        Returns page title from form_titles based on the rendered data
        :return string: page title
        """
        if self.render_type == 'table':
            return self.form_titles.get('table', '')
        elif self.data.get('id', None):
            return self.form_titles.get('edit', '')
        else:
            return self.form_titles.get('new', '')

    # noinspection PyProtectedMember
    @property
    def filter_data(self):
        """
        Returns serializer for filter row in table
        :return:  Serializer
        """
        if not getattr(type(self), '_filter_data', None):
            _filter_data = type(self)(instance=type(self).Meta.model())
            _filter_data.serializer_type = 'filter'
            for name, field in _filter_data.fields.fields.items():
                if isinstance(field, ChoiceField):
                    field.allow_blank = True
            type(self)._filter_data = _filter_data
        return type(self)._filter_data
