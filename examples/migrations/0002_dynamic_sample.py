# Generated by Django 2.1.1 on 2018-10-05 11:41

import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('examples', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='HiddenFields',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('note', models.CharField(help_text='Enter abc to hide unit field', max_length=20)),
                ('unit', models.CharField(blank=True, choices=[('pcs', 'Pieces'), ('wt', 'Weight'), ('cst', 'Custom')], max_length=10, null=True)),
                ('int_fld', models.IntegerField(blank=True, null=True, verbose_name='Quantity')),
                ('qty_fld', models.FloatField(blank=True, help_text='Fell free to use a decimal point / comma', null=True, verbose_name='Weight')),
                ('cst_fld', models.CharField(blank=True, help_text='Enter additional info here', max_length=80, null=True, verbose_name='Comment')),
                ('additional_text', models.CharField(blank=True, help_text='Now that you have shown me, please enter something', max_length=80, null=True)),
            ],
        ),
        migrations.AlterField(
            model_name='validated',
            name='item_flags',
            field=models.CharField(blank=True, choices=[('A', 'A'), ('B', 'B'), ('C', 'C'), ('D', 'D')], max_length=4, validators=[django.core.validators.RegexValidator('^[ABC]*$', 'Only options A-C may be chosen', 'regex')]),
        ),
    ]
