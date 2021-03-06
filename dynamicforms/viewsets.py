from datetime import datetime

import pytz
from django.conf import settings
from django.db import models
from django.http import Http404
from rest_framework import status, viewsets
from rest_framework.response import Response
from rest_framework.serializers import ListSerializer
from rest_framework.utils.serializer_helpers import ReturnDict, ReturnList

from dynamicforms.settings import TEMPLATE
from .renderers import TemplateHTMLRenderer
from .settings import BSVER_MODAL


class NewMixin(object):
    """
    Provides support for retrieving default values for a new record.

    Caution: Do not use directly. This is only a mixin and is used in final ViewSet derivatives.
    """

    def new_object(self: viewsets.ModelViewSet):
        """
        Returns a new model instance. If you need it pre-populated with default values, this is the method to override.

        :return: model instance
        """
        # TODO: This function must return an object that has its field values correctly / realistically filled out
        # Example: if a certain field's value hides (sets another field to None), then that second field can't be
        # set to 42, can it?
        # can we run some kind of validation to enforce this?
        # Not that easy: the returned record may not validate for its (correctly) empty fields
        # Maybe we will have to run JavaScript onchange for all fields displayed to ensure at least some consistency?
        # If we do not, subsequent validation may fail because a hidden field has a value
        return self.get_queryset().model()

    # noinspection PyUnresolvedReferences
    def retrieve(self: viewsets.ModelViewSet, request, *args, **kwargs):
        try:
            return super().retrieve(request, *args, **kwargs)
        except Http404:
            lookup_url_kwarg = self.lookup_url_kwarg or self.lookup_field
            filter_kwargs = {self.lookup_field: self.kwargs[lookup_url_kwarg]}
            if filter_kwargs.get('pk', None) == 'new':
                instance = self.new_object()
                serializer = self.get_serializer(instance)
                return Response(serializer.data)
            else:
                raise


class ModelViewSet(NewMixin, viewsets.ModelViewSet):
    """
    In addition to all the functionality, provided by DRF, DynamicForms ViewSet has some extra features:

    * Separate templates for rendering list or single record
    * You can request a "new" record and even have it pre-populated with values
    * To render viewset as API or JSON use the same method as in DRF: To render it in HTML just add ".html" to the URL.
    * Standard DRF router URL patterns apply:

       * To render a new record use pk=new.
       * To render an existing record (for editing) use pk={record_id}.

    """

    template_context = {}
    """
    template_context provides configuration to templates being rendered

    Note that when adding data from database, it is advised to make this definition a callable so that it is evaluated
    on each render of the ViewSet: that way you can ensure data is always loaded fresh from database.

    e.g.

    .. code-block:: python

       template_context = lambda self: dict(items=MyModel.objects.all())
       
    or
    
    .. code-block:: python
    
       def template_context(self):
           return dict(items=MyModel.objects.all())
    """

    template_name = TEMPLATE + 'base_list.html'  #: template filename for listing multiple records (html renderer)

    # noinspection PyAttributeOutsideInit
    def initialize_request(self, request, *args, **kwargs):
        # Caution: just to be sure for any future debugging: the request parameter to this function is a WSGIRequest
        #  while the return Request is actually DRF Request
        #  As a consequence, form values don't get parsed until you actually call super().initialize_request
        #  There's no "request.data", etc. Just saying. So you don't debug for two hours next time. By "you" I mean me

        # Force render using a given render path (full page, table, table rows, form, dialog with form)
        self.render_type = request.META.get('HTTP_X_DF_RENDER_TYPE', request.GET.get('df_render_type', 'page'))

        if request.method.lower() == 'post' and request.POST.get('data-dynamicforms-method', None):
            # This is a hack because HTML forms can only do POST & GET. This way we also get PUT & PATCH
            request.method = request.POST.get('data-dynamicforms-method')
        return super().initialize_request(request, *args, **kwargs)

    def finalize_response(self, request, response, *args, **kwargs):
        res = super().finalize_response(request, response, *args, **kwargs)

        if isinstance(res.accepted_renderer, TemplateHTMLRenderer) and \
                (status.is_success(res.status_code) or res.status_code == status.HTTP_400_BAD_REQUEST):
            if isinstance(res.data, dict) and 'next' in res.data and 'results' in res.data and \
                    isinstance(res.data['results'], (ReturnList, ReturnDict)):
                serializer = res.data['results'].serializer
            else:
                serializer = res.data.serializer

            if isinstance(serializer, ListSerializer):
                serializer.child.render_type = self.render_type
            else:
                serializer.render_type = self.render_type

            if self.render_type in ('table', 'table rows'):
                serializer.data_template = self.template_name
            elif self.render_type == 'dialog':
                serializer.data_template = BSVER_MODAL
                res.template_name = BSVER_MODAL
            elif self.render_type == 'form':
                serializer.data_template = res.data.serializer.template_name
            else:
                if isinstance(serializer, ListSerializer):
                    serializer.child.render_type = 'table'
                    serializer.child.data_template = self.template_name
                else:
                    serializer.render_type = 'form'
                    serializer.data_template = serializer.template_name

        return res

    def get_queryset(self):
        """
        Returns records from queryset with filters applied

        :return: filtered records
        """
        queryset = super().get_queryset()
        queryset = self.filter_queryset(queryset)

        return queryset.all()

    def filter_queryset(self, queryset):
        """
        Applies filters for all fields

        :param queryset: Queryset
        :return: queryset with filters applied
        """
        res = queryset
        for fld, val in self.request.query_params.items():
            res = self.filter_queryset_field(res, fld, val)
        return res

    # noinspection PyMethodMayBeStatic
    def filter_queryset_field(self, queryset, field, value):
        """
        Applies filter to individual field

        :param queryset: Queryset
        :param field: Field name
        :param value: Field value
        :return: queryset with applied filter for the field
        """
        if value is None or value == '':
            return queryset

        model_meta = queryset.model._meta

        if field not in (fld.name for fld in model_meta.get_fields()):
            return queryset

        if isinstance(model_meta.get_field(field), (models.CharField, models.TextField)):
            return queryset.filter(**{field + '__icontains': value})
        if isinstance(model_meta.get_field(field), (models.DateField, models.DateTimeField)):
            date_time = None
            for date_time_fmt in [settings.DATETIME_FORMAT, '%Y-%m-%dT%H:%M:%S', settings.DATE_FORMAT, '%Y-%m-%d']:
                try:
                    date_time = datetime.strptime(value, date_time_fmt)
                    break
                except:
                    pass
            if date_time is None:
                return queryset
            date_time.replace(tzinfo=pytz.utc)
            if date_time.hour == 0 and date_time.minute == 0 and date_time.second == 0:
                return queryset.filter(**{field + '__contains': date_time.date()})
            return queryset.filter(**{field + '__contains': date_time})
        else:
            if isinstance(model_meta.get_field(field), models.BooleanField):
                value = (value == 'true')
            return queryset.filter(**{field: value})

    @staticmethod
    def generate_paged_loader(page_size: int = 30):
        """
        Generates a Pagination class that will handle dynamic data loading for ViewSets with a lot of data.
        Use by declaring `pagination_class = ModelViewSet.generate_paged_loader()` in class variables

        :param page_size: how many records should be fetched at a time
        :return: a Pagination class
        """
        from rest_framework.pagination import CursorPagination
        ps = page_size

        class MyCursorPagination(CursorPagination):
            ordering = 'id'
            page_size = ps

        return MyCursorPagination
