/**
 * Two level dictionary
 */
function TLD() {
  this.storage = {};
}

TLD.prototype = {
  get: function get(key1, key2) {
    if (this.storage[key1] == undefined)
      return undefined;
    if (key2 == undefined)
      return this.storage[key1];
    return this.storage[key1][key2];
  },

  set: function set(key1, key2, value) {
    if (this.storage[key1] == undefined)
      this.storage[key1] = {};
    if (key2 == undefined)
      this.storage[key1] = value;
    else
      this.storage[key1][key2] = value;
  },

  del: function del(key1, key2) {
    if (key2)
      delete this.storage[key1][key2];
    else
      delete this.storage[key1];
  },

  getOrCreate: function getOrCreate(key1, key2, defVal) {
    var res = this.get(key1, key2);
    if (res == undefined) {
      res = defVal;
      this.set(key1, key2, res);
    }
    return res;
  },
};

dynamicforms = {
  // DF is an object containing all dynamicforms settings as specified by defaults and in settings.py
  DF: {
    // This is only necessary so that IDE doesn't complain about members not found when you use any of the settings
    // in code
    "MODULE_PREFIX":        "DYNAMICFORMS_",
    "TEMPLATE":             "dynamicforms/bootstrap/",
    "TEMPLATE_OPTIONS":     {
      "BOOTSTRAP_VERSION": "v4",
      "EDIT_IN_DIALOG":    true,
    },
    "MODAL_DIALOG":         "modal_dialog",
    "BSVER_INCLUDES":       "dynamicforms/bootstrap/base_includes_v4.html",
    "BSVER_FIELD_TEMPLATE": "dynamicforms/bootstrap/field/base_field_v4.html",
    "BSVER_MODAL":          "dynamicforms/bootstrap/modal_dialog_v4.html",
  },

  /**
   * Presents the error in data exchange with the server in a user understandable way
   * @param xhr
   * @param status
   * @param error
   */
  showAjaxError: function showAjaxError(xhr, status, error) {
    //TODO: make proper error display message. You will probably also need some text about what you were trying to do
    console.log(xhr, status, error);
  },

  /**
   * Handles what happens when user says "Save data". Basically serialization, send to server, response to returned
   * status and values
   * @param $dlg: current dialog which will be updated with call results or closed on successful data store
   * @param $form: the edited form containing the data
   */
  submitForm: function submitForm($dlg, $form) {
    var data    = dynamicforms.getSerializedForm($form, 'final');
    var method  = data['data-dynamicforms-method'] || 'POST';
    var headers = {'X-DF-RENDER-TYPE': 'dialog'};

    headers['X-CSRFToken'] = dynamicforms.csrf_token;

    $.ajax({
             type:     method,
             url:      $form.attr("action"),
             data:     data,
             dataType: 'html',
             headers:  headers,
           })
      .done(function () {
        // TODO: refresh list of items. Dialog just closes, but whatever we changed doesn't get updated in the list
        dynamicforms.closeDialog($dlg);
      })
      .fail(function (xhr, status, error) {
        // TODO: this doesn't handle errors correctly: if return status is 400 something, it *might* be OK
        // but if it's 500 something, dialog will be replaced by non-dialog code and displaying it will fail
        // also for any authorization errors, CSRF, etc, it will again fail
        // Try finding a <div class="dynamicforms-dialog"/> in there to see if you actually got a dialog
        dynamicforms.replaceDialog($dlg, $(xhr.responseText));
      });
  },

  /**
   * Shows a dialog, attaches appropriate event handlers to buttons and gets initial data values
   * @param $dlg
   */
  showDialog: function showDialog($dlg) {
    //TODO: adjust hashURL
    $(document.body).append($dlg);
    var $form = $dlg.find('.dynamicforms-form');
    $($dlg).on('hidden.bs.modal', function () {
      // dialog removes itself from DOM hierarchy
      $dlg.remove();

      dynamicforms.removeFormDeclarations($form);
    });

    // Let's get initial field values from the form
    dynamicforms.serializeForm($form, 'final');

    var saveId = '#save-' + $form.attr('id');
    $(saveId).on('click', function () {
      dynamicforms.submitForm($dlg, $form);
    });
    // And show the dialog
    $dlg.modal();
  },

  /**
   * Replaces the current dialog with a new one. Different than close + open in animation
   * TODO: change animation
   * @param $dlg: dialog to close
   * @param $newDlg: newdialog to show
   */
  replaceDialog: function replaceDialog($dlg, $newDlg) {
    dynamicforms.closeDialog($dlg);
    dynamicforms.showDialog($newDlg);
  },

  /**
   * Closes the current dialog
   * TODO: adjust hashURL
   * @param $dlg: dialog to close
   */
  closeDialog: function closeDialog($dlg) {
    $dlg.modal('hide');
  },

  /**
   * Handles what should happen when user clicks to edit a record
   * @param recordURL: url to call to get data / html for the record / dialog
   */
  editRow: function editRow(recordURL) {
    if (dynamicforms.DF.TEMPLATE_OPTIONS.EDIT_IN_DIALOG) {
      recordURL += '?df_render_type=dialog'; // TODO: is this necessary? we already add the header
      $.ajax({
               url:     recordURL,
               headers: {'X-DF-RENDER-TYPE': 'dialog'},
             })
        .done(function (dialogHTML) {
          dynamicforms.showDialog($(dialogHTML));
        })
        .fail(function (xhr, status, error) {
          dynamicforms.showAjaxError(xhr, status, error);
        });
    } else
      window.location = recordURL;
  },

  /**
   * Handles what should happen when user clicks to delete a record
   * @param recordURL: url to call to get data / html for the record / dialog
   */
  deleteRow: function deleteRow(recordURL) {
    //TODO: Ask user for confirmation
    $.ajax({
             url:     recordURL,
             method:  'DELETE',
             headers: {'X-CSRFToken': dynamicforms.csrf_token},
           })
      .done(function (dialogHTML) {
        console.log('Record successfully deleted.');
        //  TODO: make a proper notification
      })
      .fail(function (xhr, status, error) {
        dynamicforms.showAjaxError(xhr, status, error);
      });
  },

  /**
   * Handles what should happen when user clicks "Add new" button
   * Right now newRow doesn't do anything distinct, so let's just call editRow
   *
   * @param recordURL: url to call to get data / html for the record / dialog
   * @returns {*|void}
   */
  newRow: function newRow(recordURL) {
    return dynamicforms.editRow(recordURL);
  },

  /**************************************************************
   * Form current values support functions
   **************************************************************/

  df_tbl_pagination: new TLD(),

  form_helpers: new TLD(),

  _checkFinalParam: function _checkFinalParam(final) {
    if (final != 'final' && final != 'non-final') {
      console.trace();
      throw "Final is not in the allowed values! '" + final + "'";
    }
  },

  serializeForm: function serializeForm($form, final) {
    dynamicforms._checkFinalParam(final);
    var formID    = $form.attr('id');
    var form_data = dynamicforms.form_helpers.getOrCreate(formID, final, {});
    $.each(dynamicforms.form_helpers.get(formID, 'fields'), function (fieldID, field) {
      form_data[field.name] = field.getValue(field.$field);
    });
    var fld = $form.find('input[name="data-dynamicforms-method"]');
    if (fld.length == 1)
      form_data['data-dynamicforms-method'] = fld.val();
  },

  clearSerializedForm: function clearSerializedForm($form, final) {
    dynamicforms._checkFinalParam(final);
    dynamicforms.form_helpers.del($form.attr('id'), final);
  },

  getSerializedForm: function getSerializedForm($form, final) {
    dynamicforms._checkFinalParam(final);
    return dynamicforms.form_helpers.get($form.attr('id'), final);
  },

  getSerializedFormFinal: function getSerializedFormFinal($form, final) {
    var newFormData = dynamicforms.getSerializedForm($form, final);
    if (final == 'final')
      dynamicforms.clearSerializedForm($form, 'non-final');
    else if (newFormData == undefined)
      newFormData = dynamicforms.getSerializedForm($form, 'final');
    return newFormData;
  },

  removeFormDeclarations: function removeFormDeclarations($form) {
    var formID = $form.attr('id');
    $.each(dynamicforms.form_helpers.getOrCreate(formID, 'fields', {}),
           function (fieldID) {
             dynamicforms.field_helpers.del(fieldID);
           }
    );
    dynamicforms.form_helpers.del(formID);
  },
  /**************************************************************
   * Actions support functions
   **************************************************************/

  // A helper obj containing all getters, setters, previous onchanging values, etc.
  field_helpers:          new TLD(),

  /**
   * fieldChange function is called whenever field's value changes. Some fields support even "changing" events where
   * this function will be called for every change in the field's contents (e.g. typing a new letter into input).
   * This function will then propagate the event to all actions letting them know of the change
   * Note that "onchanging" has a separate "previous value" tracking. "onchanged" will report value before any editing
   * no matter how many times "onchanging" has been processed
   *
   * TODO does getValue require a "default" parameter? In what situations would the default value be returned?
   * TODO what does getValue return for inputs that are currently hidden or suppressed? Proposal: nothing, but we must always use PATCH, not PUT?
   * //$inputs.on('change keyup paste', function () { self.selectMenuShow(false, $(this)); });  //navaden input onchanging
   * //$inputs.on('focusout', function () { self.selectMenuShow(true, $(this)); });  // navaden input onchanged
   *
   * @param fieldID: id of the field
   * @param final: 'final' when this is "onchanged" and 'non-final' when this is "onchanging"
   */
  fieldChange: function fieldChange(fieldID, final) {
    dynamicforms._checkFinalParam(final);

    var field       = dynamicforms.field_helpers.get(fieldID),
        $field      = field.$field,
        $form       = field.$form,
        newValue    = field.getValue($field),
        oldValue,
        newFormData = dynamicforms.getSerializedFormFinal($form, final),
        oldFormData = {};

    // Copy the current form values to "old" object and adjust the current values with the change
    $.extend(true, oldFormData, newFormData);
    var field_name          = $field.attr('name');
    oldValue                = newFormData[field_name];
    newFormData[field_name] = newValue;

    // Process the change if there was any
    if (oldValue != newValue)
      dynamicforms.processChangedFields(final, [fieldID], oldFormData, newFormData);
  },

  /**
   * This function calls the handlers when a field has been changed. After processing the handlers it will check for
   * additional changes. If detected, it will process the handlers for the new changes as well.
   * @param final: 'final' when this is "onchanged" and 'non-final' when this is "onchanging"
   * @param fields: list[field id]
   * @param oldFormData: object
   * @param newFormData: object
   */
  processChangedFields: function processChangedFields(final, fields, oldFormData, newFormData) {
    var changedHelper = new TLD();

    //Apply field actions
    $.each(fields, function (idx, fieldID) {
      var field      = dynamicforms.field_helpers.get(fieldID),
          $field     = field.$field,
          field_name = $field.attr('name'),
          $form      = field.$form,
          formID     = $form.attr('id');

      if (changedHelper.get(formID, 'visibility') == undefined) {
        // Remember current field visibility
        changedHelper.set(formID, 'visibility', dynamicforms.getVisibleFields(formID));
        changedHelper.set(formID, 'old', newFormData);
      }
      // console.log('Field "' + field_name + '" value has changed. Triggering actions');
      var actions = dynamicforms.form_helpers.get(formID, 'actions_' + fieldID);
      if (actions) {
        $.each(actions, function (idx, action) {
          // TODO while running actions, it's probably better not to process onchange
          action($form.attr('id'), newFormData, oldFormData, [fieldID]);
        });
      }
    });

    $.each(changedHelper.storage, function (formID, ignored) {
      var $form         = $('#' + formID),
          // Get new field values & visibility
          oldFormData   = changedHelper.get(formID, 'old'),
          newFormData   = dynamicforms.getSerializedFormFinal($form, final),
          oldVisibility = changedHelper.get(formID, 'visibility'),
          newVisibility = dynamicforms.getVisibleFields(formID),
          changedFields = [];

      // get diff for visibility & union it with diff for field values
      $.each(dynamicforms.form_helpers.get(formID, 'fields'), function (fieldID, field) {
        if (
          ($.inArray(fieldID, oldVisibility) != -1) != ($.inArray(fieldID, newVisibility) != -1) ||
          (newFormData[field.name] != oldFormData[field.name])
        ) {
          changedFields.push(fieldID);
        }
      });

      // go through all fields and run their actions if either their value or their visibility is changed
      processChangedFields(final, changedFields, oldFormData, newFormData);
    });
  },

  /**
   * Registers an onchange event with action to execute when given field's value changes
   * @param formID: id of form object
   * @param fieldID: id of the field
   * @param func: function to be called for getting current field value
   */
  registerFieldAction: function registerFieldAction(formID, fieldID, func) {
    var fieldActions = dynamicforms.form_helpers.get(formID, 'actions_' + fieldID) || [];
    fieldActions.push(func);
    dynamicforms.form_helpers.set(formID, 'actions_' + fieldID, fieldActions);
  },

  /**
   * Registers the function which will get current field's value. See "standard" fieldGetValue below
   * @param formID: id of form object
   * @param fieldID: id of the field
   * @param func: function to be called for getting current field value
   */
  registerFieldGetter: function registerFieldGetter(formID, fieldID, func) {
    var field      = dynamicforms.field_helpers.getOrCreate(fieldID, undefined, {});
    field.getValue = func;
    dynamicforms.updateFieldHelpers(formID, fieldID, field);
  },

  /**
   * Registers the function which will set current field's value. See "standard" fieldSetValue below
   * @param formID: id of form object
   * @param fieldID: id of the field
   * @param func: function to be called for setting current field value
   */
  registerFieldSetter: function registerFieldSetter(formID, fieldID, func) {
    var field      = dynamicforms.field_helpers.getOrCreate(fieldID, undefined, {});
    field.setValue = func;
    dynamicforms.updateFieldHelpers(formID, fieldID, field);
  },

  /**
   * Sets some standard field helper values so that they don't have to be re-calculated every time
   * @param formID: id of form object
   * @param fieldID: id of the field
   * @param field: field data to be populated
   */
  updateFieldHelpers: function updateFieldHelpers(formID, fieldID, field) {
    if (field.$field == undefined) {
      field.$field = $('#' + fieldID);
      field.$form  = $('#' + formID);
      field.name   = field.$field.attr('name');
    }
    var form_fields       = dynamicforms.form_helpers.getOrCreate(formID, 'fields', {});
    form_fields[fieldID]  = field;
    var field_ids         = dynamicforms.form_helpers.getOrCreate(formID, 'field_ids', {});
    field_ids[field.name] = fieldID;
  },

  /**
   * Gets an object which maps field names to their IDs. This function is a helper for actions where field UUIDs
   * are not known in advance. Its result is passed to functions such as fieldSetValue.
   *
   * @param formID: id of form object
   * @return: object where obj.field_name == field control ID
   */
  getFieldIDs: function getFieldIDs(formID) {
    return dynamicforms.form_helpers.getOrCreate(formID, 'field_ids', {});
  },

  /**
   * "Standard" function for getting an input's current value. Any special cases will be handled in custom functions
   *
   * @param field: id or jQuery object of the field
   * @returns field value
   */
  fieldGetValue: function fieldGetValue(field) {
    var $field = field instanceof jQuery ? field : dynamicforms.field_helpers.get(field, '$field');
    return $field.val();
  },

  /**
   * "Standard" function for setting an input's value. Any special cases will be handled in custom functions
   *
   * @param field: id or jQuery object of the field
   * @param value: new value to set
   */
  fieldSetValue: function fieldSetValue(field, value) {
    var $field = field instanceof jQuery ? field : dynamicforms.field_helpers.get(field, '$field');
    $field.val(value);
  },

  /**
   * "Standard" function for setting an input's visibility. Any special cases will be handled in custom functions
   *
   * @param field: id or jQuery object of the field
   * @param visible: boolean specifying whether field should be visible
   */
  fieldSetVisible: function fieldSetVisible(field, visible) {
    //TODO: we need to check parent container if everything inside it is hidden. If there is, the parent container needs to hide too
    var $field  = field instanceof jQuery ? field : dynamicforms.field_helpers.get(field, '$field');
    var fieldID = $field.attr('id');
    $field.parents('#container-' + fieldID).toggle(visible);
  },

  /**
   * "Standard" function for checking whether an input's is visible. Any special cases will be handled in custom
   * functions
   *
   * @param field: id or jQuery object of the field
   * @return: boolean true for visible, false for hidden
   */
  fieldIsVisible: function fieldIsVisible(field) {
    var $field  = field instanceof jQuery ? field : dynamicforms.field_helpers.get(field, '$field');
    var fieldID = $field.attr('id');
    return $field.parents('#container-' + fieldID).is(":visible");
  },

  getVisibleFields: function getVisibleFields(formID) {
    var res = [];
    $.each(dynamicforms.form_helpers.get(formID, 'fields'), function (fieldID, field) {
      if (dynamicforms.fieldIsVisible(field.$field))
        res.push(fieldID);
    });
    return res;
  },

  /**
   * Pagination init for table.
   * Remembers url for loading next page and sets trigger element for start of loading next page
   * When trigger element is visible on screen loading starts
   *
   * @param formID: id of table object
   * @param link_next: url with cursor definition for loading next page
   * @param link_prev: url with cursor definition for loading previous page
   */
  paginatorInitTable: function paginatorInitTable(formID, link_next, link_prev) {
    if (link_next != "") {
      dynamicforms.df_tbl_pagination.set(formID, 'link_next', link_next);
      var table_rows = $("#list-" + formID).find("tbody:first").find("tr");
      dynamicforms.df_tbl_pagination.set(formID, 'trigger_element', table_rows[0]);
    }
  },

  /**
   * Checks if loading of next page should start
   * If trigger element is visible on screen
   *
   * @param formID: id of table object
   */
  paginatorCheckGetNextPage: function paginatorCheckGetNextPage(formID) {
    var trigger_element = dynamicforms.df_tbl_pagination.get(formID, 'trigger_element');

    if (trigger_element != null) {
      var rect = trigger_element.getBoundingClientRect();

      if (rect.height != 0 && rect.width != 0 && rect.top <= (window.innerHeight || document.documentElement.clientHeight))
        dynamicforms.paginatorGetNextPage(formID, '');

      //TODO: Check both methods of determining whether control item is showing (unit tests for one and the other?)
      // problem with unit tests is that automated ones only run in Firefox

      //   var top_of_element    = trigger_element.offset().top;
      //   var bottom_of_element = top_of_element + trigger_element.outerHeight();
      //   var top_of_screen     = $(window).scrollTop();
      //   var bottom_of_screen  = top_of_screen + window.innerHeight;
      //
      //   if (bottom_of_screen > top_of_element) {
      //     dynamicforms.paginatorGetNextPage(formID);
      //   }
    }
  },

  /**
   * Calls server to get next page. When filter is given all current records will be deleted and only new ones will be
   * shown
   *
   * @param formID: id of table object
   * @param filter: filter params
   */
  paginatorGetNextPage: function paginatorGetNextPage(formID, filter) {
    var tbl_pagination = dynamicforms.df_tbl_pagination.get(formID, undefined);
    var link_next      = '';
    if (filter.length) {
      link_next = dynamicforms.form_helpers.get(formID, 'reverseRowURL');
      if (filter != 'nofilter')
        link_next += '?' + filter;
    }
    else
      link_next = tbl_pagination.link_next;

    if (link_next != null && link_next != "None" && (link_next != tbl_pagination.last_link_next || filter.length)) {
      tbl_pagination.last_link_next = link_next;

      var table = $("#list-" + formID).find("tbody:first");
      if (filter.length) {
        dynamicforms.df_tbl_pagination.set(formID, 'trigger_element', null);
        table.find('tr').remove();
      }
      $("#loading-" + formID).show();
      //TODO: Remember sequence number... if data that comes back has other than last sequence number than just ignore it #114
      $.ajax({
               type:    'GET',
               headers: {'X-CSRFToken': dynamicforms.csrf_token, 'X-DF-RENDER-TYPE': 'table rows'},
               url:     link_next,
             }).done(function (data) {

        data                     = $(data).filter("tr");
        tbl_pagination.link_next = data[0].getAttribute('data-next');

        if (data[0].getAttribute("data-title") != "NoData") {
          // remove elements, that are already shown - in case of new data insertion and order different than id.
          for (var i = data.length - 1; i >= 0; i--) {
            var data_id = data[i].getAttribute('data-id');
            if (data_id == null || table.find("tr[data-id='" + data_id + "']").length > 0)
              data.splice(i, 1);
          }
        }
        else if (table.find("tr").length > 0)
          data = [];

        //TODO: If NoData comes back - I reached the end of dataset... do I even attempt further reading?
        //  for log-type datasets where new data is frequently inserted, it might be useful.
        $("#loading-" + formID).hide();
        if (data.length > 0) {
          table.append(data);
          tbl_pagination.trigger_element = data[0];
        }
        dynamicforms.paginatorCheckGetNextPage(formID);
      }).fail(function (xhr, status, error) {
        $("#loading-" + formID).hide();
        console.log('Pagination failed.', xhr, status, error);
        // TODO: what if the server returns an error? Do we continue with pagination? (Task #100)
      });
    }
  },

  /**
   * Goes through all tables that uses pagination and calls paginatorCheckGetNextPage function for them
   */
  paginatorCheckGetNextPageAll: function paginatorCheckGetNextPageAll() {
    for (var formID in dynamicforms.df_tbl_pagination.storage)
      dynamicforms.paginatorCheckGetNextPage(formID);
  },

  /**
   * Registers filtering data on enter press in filter fields
   *
   * @param formID: id of table object
   * @param reverseRowURL: url for getting filtered data
   */
  registerFilterRowKeypress: function registerFilterRowKeypress(formID, reverseRowURL) {
    dynamicforms.form_helpers.set(formID, 'reverseRowURL', reverseRowURL);
    $($("#list-" + formID).find("tr.dynamicforms-filterrow")[0]).keypress(function (e) {
      if (e.which == 13) {
        dynamicforms.filterData(formID);
      }
    })
  },

  /**
   * Prepares filter string and calls server to get filtered data
   *
   * @param formID: id of table object
   */
  filterData: function filterData(formID) {
    var filter = {};
    $("#list-" + formID).find(".dynamicforms-filterrow th").each(function (index) {

      var element = $(this).find("[name='" + $(this).attr("data-name") + "']");

      if (element.attr('type') == 'checkbox') {
        if (element.is(':checked'))
          filter[element.attr("name")] = true;
        else if (!element.is('[readonly]'))
          filter[element.attr("name")] = false;
      }
      else if (element.val() != null && element.val().length)
        filter[element.attr("name")] = element.val();
    });
    filter = jQuery.param(filter);
    if (!filter.length)
      filter = 'nofilter';
    dynamicforms.paginatorGetNextPage(formID, filter);
  },

  /**
   * "Standard" function which is called after filter button in header is clicked.
   * It finds id of table object and calls filterData function with it.
   *
   * @param event: OnClick event from which we get id of table object
   */
  defaultFilter: function defaultFilter(event) {
    var formId = $(event.currentTarget).parents('div.card').find('div.card-body').find('table')[0].getAttribute('id').replace('list-', '');
    dynamicforms.filterData(formId);
  }
};

$(document).ready(function () {
  // Let's get initial field values from the forms that are on-page already
  // TODO: Is this jQuery-specific? Will vue.js page also contain some kind of initializer or will everything just work?
  // TODO: also might be prudent to just move this to base_form.html. we already process dialogs separately...
  $('.dynamicforms-form').each(function (idx, form) {
    dynamicforms.serializeForm($(form), 'final');
  });
  window.setInterval(dynamicforms.paginatorCheckGetNextPageAll, 100);
})

