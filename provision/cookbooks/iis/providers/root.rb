#
# Author:: Justin Schuhmann (<jmschu02@gmail.com>)
# Cookbook Name:: iis
# Provider:: root
#
# Copyright:: Justin Schuhmann
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#

include Opscode::IIS::Helper
include Opscode::IIS::Processors

action :add do
  @was_updated = false

  @was_updated = default_documents(new_resource.add_default_documents, new_resource.default_documents_enabled, true, false) | @was_updated
  @was_updated = mime_maps(new_resource.add_mime_maps, true, false) | @was_updated

  if @was_updated
    new_resource.updated_by_last_action(true)
  else
    Chef::Log.debug("#{new_resource} - nothing to do")
  end
end

action :delete do
  @was_updated = false

  @was_updated = default_documents(new_resource.delete_default_documents, new_resource.default_documents_enabled, false) | @was_updated
  @was_updated = mime_maps(new_resource.delete_mime_maps, false) | @was_updated

  if @was_updated
    new_resource.updated_by_last_action(true)
  else
    Chef::Log.debug("#{new_resource} - nothing to do")
  end
end

action :config do
  @was_updated = false

  @was_updated = default_documents(new_resource.default_documents, new_resource.default_documents_enabled) | @was_updated
  @was_updated = mime_maps(new_resource.mime_maps) | @was_updated

  if @was_updated
    new_resource.updated_by_last_action(true)
  else
    Chef::Log.debug("#{new_resource} - nothing to do")
  end
end

def load_current_resource
  @current_resource = Chef::Resource::IisRoot.new(new_resource.name)
  @current_resource.default_documents(new_resource.default_documents)
  @current_resource.default_documents_enabled(new_resource.default_documents_enabled)
  @current_resource.mime_maps(new_resource.mime_maps)
end
