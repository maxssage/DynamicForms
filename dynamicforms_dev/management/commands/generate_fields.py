import inspect
import os
import textwrap
import uuid

from django.core.management.base import BaseCommand
from rest_framework import fields
from rest_framework import relations


class Command(BaseCommand):
    help = 'Generate Field classes from DRF with applied DynamicForms mixins'

    # def add_arguments(self, parser):
    #     parser.add_argument('-dest', dest='file', type=str, default='strings.xlsx', action='store',
    #                         help='filename where to store the strings')

    def handle(self, *args, **options):
        from dynamicforms.mixins import UUIDMixIn

        with open(os.path.abspath(os.path.join('dynamicforms/', 'fields.py')), 'w') as output:

            field_list = []
            for obj in fields.__dict__.values():
                if obj != fields.Field and inspect.isclass(obj) and \
                        issubclass(obj, fields.Field) and not obj.__name__.startswith('_'):
                    field_list.append(obj)

            for obj in relations.__dict__.values():
                if obj != relations.RelatedField and inspect.isclass(obj) and \
                        issubclass(obj, relations.RelatedField) and obj.__name__.endswith('Field'):
                    field_list.append(obj)

            print('from uuid import UUID\n', file=output)
            print('from rest_framework import fields, relations', file=output)
            print('from .mixins import ActionMixin, RenderToTableMixin, UUIDMixIn', file=output)

            for field in field_list:
                field_class = field.__name__
                field_params, field_params_names = [], set()
                param_classes = []
                for cls in enumerate(field.__mro__):
                    param_classes.append(cls)
                    if cls[1] == fields.Field:
                        break
                param_classes.append((0, UUIDMixIn))

                skip_depth = 0
                for depth, cls in param_classes:
                    if depth > skip_depth:
                        continue
                    skip_depth = 0

                    if hasattr(cls, '__init__'):
                        had_kwds = False
                        for parm in inspect.signature(cls.__init__).parameters.values():

                            if field_class == 'BooleanField' and parm.name == 'allow_null':
                                # BooleanField doesn't like this one and wants us to use NullBooleanField
                                continue

                            parm_str = parm.name
                            if parm_str == 'self' or parm.kind in (parm.VAR_KEYWORD, parm.VAR_POSITIONAL):
                                # we don't repeat all the self fields there are. Not all the *args && **kwds
                                had_kwds |= parm.kind == parm.VAR_KEYWORD
                                continue
                            if depth and len(field_params) and \
                                    (parm.kind == parm.POSITIONAL_ONLY or
                                     (parm.kind == parm.POSITIONAL_OR_KEYWORD and parm.default == inspect._empty)
                                    ):
                                # positional arguments can only be declared before any keyword ones
                                continue

                            p_an = parm.annotation
                            p_def = parm.default

                            if p_an != inspect._empty:
                                if isinstance(p_an, (str, int, float, bool,)) or p_an is None:
                                    parm_str += ': ' + repr(p_an)
                                elif p_an in (uuid.UUID,):
                                    parm_str += ': ' + p_an.__name__
                                else:
                                    # if you get this error, you need to add the type to includes at the top
                                    # of this function and then implement the actual printing just above here
                                    print(f'Error: parameter {parm.name} annotation is of unknown type '
                                          f'{parm.annotation}.')

                            if p_def != inspect._empty:
                                if isinstance(p_def, (str, int, float, bool,)) or p_def is None:
                                    parm_str += '=' + repr(p_def)
                                elif p_def in (fields.empty,):
                                    parm_str += '=' + '.'.join((p_def.__module__.split('.')[-1], p_def.__name__))
                                else:
                                    print(f'Error: parameter {parm.name} default is of unknown type {parm.default}.')

                            if parm.name not in field_params_names:
                                field_params_names.add(parm.name)
                                field_params.append(parm_str)

                        if had_kwds:
                            skip_depth = depth + 1

                field_params.insert(0, 'self')
                field_params.append('**kw')
                field_params = textwrap.wrap((', '.join(field_params)).replace(': ', ':_'), width=103)
                field_params = textwrap.indent('\n'.join(field_params), ' ' * 37).lstrip(' ').replace(':_', ': ')

                additional_inspects = ''
                if field_class in ('SerializerMethodField', 'HiddenField', 'ReadOnlyField'):
                    additional_inspects += ',PyAbstractClass'
                if 'format' in field_params_names:
                    additional_inspects += ',PyShadowingBuiltins'
                field_module = 'fields.' if field_class in fields.__dict__ else 'relations.'

                print(textwrap.dedent(f"""
                
                    # noinspection PyRedeclaration{additional_inspects}
                    class {field_class}(UUIDMixIn, ActionMixin, RenderToTableMixin, {field_module}{field_class}):
                    
                        def __init__({field_params}):
                            kwargs = {{k: v for k, v in locals().items() if not k.startswith(('__', 'self', 'kw'))}}
                            kwargs.update(kw)
                            super().__init__(**kwargs)"""
                                      ), file=output)

        print('fields.py successfully generated')
        # options['file']
